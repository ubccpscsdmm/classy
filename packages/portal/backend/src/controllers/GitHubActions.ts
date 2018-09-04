import * as rp from "request-promise-native";
import Config, {ConfigKey} from "../../../../common/Config";
import Log from "../../../../common/Log";
import Util from "../../../../common/Util";
import {DatabaseController} from "./DatabaseController";
import {GitTeamTuple} from "./GitHubController";

// tslint:disable-next-line
const tmp = require('tmp-promise');

export class GitHubActions {

    private readonly apiPath: string | null = null;
    private readonly gitHubUserName: string | null = null;
    private readonly gitHubAuthToken: string | null = null;
    private readonly org: string | null = null;

    private DELAY_SEC = 1000;
    public PAGE_SIZE = 100; // public for testing; 100 is the max; 10 is good for tests

    private dc: DatabaseController = null;

    constructor() {
        // NOTE: this is not very controllable; these would be better as params
        this.org = Config.getInstance().getProp(ConfigKey.org);
        this.apiPath = Config.getInstance().getProp(ConfigKey.githubAPI);
        this.gitHubUserName = Config.getInstance().getProp(ConfigKey.githubBotName);
        this.gitHubAuthToken = Config.getInstance().getProp(ConfigKey.githubBotToken);
        this.dc = DatabaseController.getInstance();
    }

    /**
     * Creates a given repo and returns its URL. If the repo exists, return the URL for that repo.
     *
     * Also updates the Repository object in the datastore with the URL and cloneURL.
     *
     * @param repoId The name of the repo. Must be unique within the organization.
     * @returns {Promise<string>} provisioned team URL
     */
    public async createRepo(repoId: string): Promise<string> {
        const ctx = this;
        try {
            Log.info("GitHubAction::createRepo( " + repoId + " ) - start");
            await ctx.checkDatabase(repoId, null);

            const uri = ctx.apiPath + '/orgs/' + ctx.org + '/repos';
            const options = {
                method:  'POST',
                uri:     uri,
                headers: {
                    'Authorization': ctx.gitHubAuthToken,
                    'User-Agent':    ctx.gitHubUserName,
                    'Accept':        'application/json'
                },
                body:    {
                    name:          repoId,
                    // In Dev and Test, Github free Org Repos cannot be private.
                    private:       true,
                    has_issues:    true,
                    has_wiki:      false,
                    has_downloads: false,
                    auto_init:     false
                },
                json:    true
            };

            const body = await rp(options);
            const url = body.html_url;

            const repo = await this.dc.getRepository(repoId);
            repo.URL = url; // only update this field in the existing Repository record
            repo.cloneURL = body.clone_url; // only update this field in the existing Repository record
            await this.dc.writeRepository(repo);

            Log.info("GitHubAction::createRepo(..) - success; URL: " + url + "; delaying to prep repo.");
            await ctx.delay(ctx.DELAY_SEC);

            return url;
        } catch (err) {
            Log.error("GitHubAction::createRepo(..) - ERROR: " + err);
            throw new Error("Repository not created; " + err.message);
        }
    }

    /**
     * Deletes a repo from the organization.
     *
     * @param repoName
     * @returns {Promise<boolean>}
     */
    public async deleteRepo(repoName: string): Promise<boolean> {
        Log.info("GitHubAction::deleteRepo( " + this.org + ", " + repoName + " ) - start");

        try {
            // first make sure the repo exists
            const repoExists = await this.repoExists(repoName);

            if (repoExists === true) {
                const uri = this.apiPath + '/repos/' + this.org + '/' + repoName;
                Log.trace("GitHubAction::deleteRepo( " + repoName + " ) - URI: " + uri);
                const options = {
                    method:  'DELETE',
                    uri:     uri,
                    headers: {
                        'Authorization': this.gitHubAuthToken,
                        'User-Agent':    this.gitHubUserName,
                        'Accept':        'application/json'
                    }
                };

                await rp(options);
                Log.info("GitHubAction::deleteRepo( " + repoName + " ) - successfully deleted");
                return true;
            } else {
                Log.info("GitHubAction::deleteRepo( " + repoName + " ) - repo does not exists; not deleting");
                return false;
            }
        } catch (err) {
            Log.error("GitHubAction::deleteRepo(..) - ERROR: " + JSON.stringify(err));
            return false;
        }
    }

    /**
     * Checks if a repo exists or not. If the request fails for _ANY_ reason the failure will not
     * be reported, only that the repo does not exist.
     *
     * @param repoName
     * @returns {Promise<boolean>}
     */
    public async repoExists(repoName: string): Promise<boolean> {

        const uri = this.apiPath + '/repos/' + this.org + '/' + repoName;
        const options = {
            method:  'GET',
            uri:     uri,
            headers: {
                'Authorization': this.gitHubAuthToken,
                'User-Agent':    this.gitHubUserName,
                'Accept':        'application/json'
            }
        };

        try {
            await rp(options);
            Log.trace("GitHubAction::repoExists( " + repoName + " ) - true");
            return true;
        } catch (err) {
            Log.trace("GitHubAction::repoExists( " + repoName + " ) - false");
            return false;
        }
    }

    /**
     * Deletes a team.
     *
     * @param teamId
     */
    public async deleteTeam(teamId: number): Promise<boolean> {

        try {
            Log.info("GitHubAction::deleteTeam( " + this.org + ", " + teamId + " ) - start");

            const uri = this.apiPath + '/teams/' + teamId;
            const options = {
                method:  'DELETE',
                uri:     uri,
                headers: {
                    'Authorization': this.gitHubAuthToken,
                    'User-Agent':    this.gitHubUserName,
                    // 'Accept': 'application/json', // custom because this is a preview api
                    'Accept':        'application/vnd.github.hellcat-preview+json'
                }
            };

            const status = await rp(options);
            if (status.statusCode === 200) {
                Log.info("GitHubAction::deleteTeam(..) - success"); // body: " + body);
                return true;
            } else {
                Log.info("GitHubAction::deleteTeam(..) - not deleted; code: " + status.statusCode);
                return false;
            }

        } catch (err) {
            Log.error("GitHubAction::deleteTeam(..) - failed; ERROR: " + err);
            return false;
        }
    }

    /**
     *
     * Gets all repos in an org.
     * This is just a subset of the return, but it is the subset we actually use:
     * @returns {Promise<{ id: number, name: string, url: string }[]>}
     */
    public async listRepos(): Promise<Array<{id: number, name: string, url: string}>> {
        Log.info("GitHubActions::listRepos(..) - start");
        const start = Date.now();

        // per_page max is 100; 10 is useful for testing pagination though
        const uri = this.apiPath + '/orgs/' + this.org + '/repos?per_page=' + this.PAGE_SIZE;
        Log.trace("GitHubActions::listRepos(..) - URI: " + uri);
        const options = {
            method:                  'GET',
            uri:                     uri,
            headers:                 {
                'Authorization': this.gitHubAuthToken,
                'User-Agent':    this.gitHubUserName,
                'Accept':        'application/json'
            },
            resolveWithFullResponse: true,
            json:                    true
        };

        const raw: any = await this.handlePagination(options);

        const rows: Array<{id: number, name: string, url: string}> = [];
        for (const entry of raw) {
            const id = entry.id;
            const name = entry.name;
            const url = entry.url;
            rows.push({id: id, name: name, url: url});
        }

        Log.info("GitHubActions::listRepos(..) - done; # repos: " + rows.length + "; took: " + Util.took(start));

        return rows;
    }

    /**
     * Gets all people in an org.
     *
     * @returns {Promise<{ id: number, type: string, url: string, name: string }[]>}
     * this is just a subset of the return, but it is the subset we actually use
     */
    public async listPeople(): Promise<Array<{id: number, type: string, url: string, name: string}>> {
        Log.info("GitHubActions::listRepos(..) - start");

        // GET /orgs/:org/members
        const uri = this.apiPath + '/orgs/' + this.org + '/members'; // per_page max is 100; 10 is useful for testing pagination though
        const options = {
            method:                  'GET',
            uri:                     uri,
            headers:                 {
                'Authorization': this.gitHubAuthToken,
                'User-Agent':    this.gitHubUserName,
                'Accept':        'application/json'
            },
            resolveWithFullResponse: true,
            json:                    true
        };

        const raw: any = await this.handlePagination(options);

        const rows: Array<{id: number, type: string, url: string, name: string}> = [];
        for (const entry of raw) {
            const id = entry.id;
            const type = entry.type;
            const url = entry.url;
            const name = entry.login;
            rows.push({id: id, type: type, url: url, name: name});
        }

        return rows;
    }

    public async handlePagination(rpOptions: rp.RequestPromiseOptions): Promise<object[]> {
        Log.info("GitHubActions::handlePagination(..) - start");

        rpOptions.resolveWithFullResponse = true; // in case clients forget
        rpOptions.json = true; // in case clients forget

        const fullResponse = await rp(rpOptions as any); // rpOptions is the right type already

        Log.trace("GitHubActions::handlePagination(..) - after initial request");

        let raw: any[] = [];
        const paginationPromises: any[] = [];
        if (typeof fullResponse.headers.link !== 'undefined') {
            // first save the responses from the first page:
            raw = fullResponse.body;

            let lastPage: number = -1;
            const linkText = fullResponse.headers.link;
            const linkParts = linkText.split(',');
            for (const p of linkParts) {
                const pparts = p.split(';');
                if (pparts[1].indexOf('last')) {
                    const pText = pparts[0].split('&page=')[1];
                    lastPage = pText.match(/\d+/)[0];
                    // Log.trace('last page: ' + lastPage);
                }
            }

            let pageBase = '';
            for (const p of linkParts) {
                const pparts = p.split(';');
                if (pparts[1].indexOf('next')) {
                    let pText = pparts[0].split('&page=')[0].trim();
                    // Log.trace('pt: ' + pText);
                    pText = pText.substring(1);
                    pText = pText + "&page=";
                    pageBase = pText;
                    // Log.trace('page base: ' + pageBase);
                }
            }

            Log.trace("GitHubActions::handlePagination(..) - handling pagination; #pages: " + lastPage);
            for (let i = 2; i <= lastPage; i++) {
                const pageUri = pageBase + i;
                // Log.trace('page to request: ' + page);
                (rpOptions as any).uri = pageUri; // not sure why this is needed
                // NOTE: this needs to be slowed down to prevent DNS problems (issuing 10+ concurrent dns requests can be problematic)
                await this.delay(100);
                paginationPromises.push(rp(rpOptions as any));
            }
        } else {
            Log.trace("GitHubActions::handlePagination(..) - single page");
            raw = fullResponse.body;
            // don't put anything on the paginationPromise if it isn't paginated
        }

        // this block won't do anything if we just did the raw thing above (aka no pagination)
        const bodies: any[] = await Promise.all(paginationPromises);
        for (const body of bodies) {
            raw = raw.concat(body.body);
        }
        Log.trace("GitHubActions::handlePagination(..) - total count: " + raw.length);

        return raw;
    }

    /**
     * Lists the teams for the current org.
     *
     * NOTE: this is a slow operation (if there are many teams) so try not to do it too much!
     *
     * @returns {Promise<{id: number, name: string}[]>}
     */
    public async listTeams(): Promise<Array<{id: number, name: string}>> {
        Log.info("GitHubActions::listTeams(..) - start");
        const start = Date.now();

        // per_page max is 100; 10 is useful for testing pagination though
        const uri = this.apiPath + '/orgs/' + this.org + '/teams?per_page=' + this.PAGE_SIZE;
        Log.info("GitHubActions::listTeams(..) - uri: " + uri);
        const options = {
            method:                  'GET',
            uri:                     uri,
            headers:                 {
                'Authorization': this.gitHubAuthToken,
                'User-Agent':    this.gitHubUserName,
                // 'Accept':        'application/json',
                'Accept':        'application/vnd.github.hellcat-preview+json'
            },
            resolveWithFullResponse: true,
            json:                    true
        };

        const teamsRaw: any = await this.handlePagination(options);

        const teams: Array<{id: number, name: string}> = [];
        for (const team of teamsRaw) {
            const id = team.id;
            const name = team.name;
            teams.push({id: id, name: name});
        }

        Log.info("GitHubActions::listTeams(..) - done; # teams: " + teams.length + "; took: " + Util.took(start));
        return teams;
    }

    public async listWebhooks(repoName: string): Promise<{}> {
        Log.info("GitHubAction::listWebhooks( " + this.org + ", " + repoName + " ) - start");

        // POST /repos/:owner/:repo/hooks
        const uri = this.apiPath + '/repos/' + this.org + '/' + repoName + '/hooks';
        const opts = {
            method:  'GET',
            uri:     uri,
            headers: {
                'Authorization': this.gitHubAuthToken,
                'User-Agent':    this.gitHubUserName
            },
            json:    true
        };

        const results = await rp(opts); // .then(function(results: any) {
        Log.info("GitHubAction::listWebhooks(..) - success: " + results);
        return results;
    }

    public async addWebhook(repoName: string, webhookEndpoint: string): Promise<boolean> {
        Log.info("GitHubAction::addWebhook( " + this.org + ", " + repoName + ", " + webhookEndpoint + " ) - start");

        // POST /repos/:owner/:repo/hooks
        const uri = this.apiPath + '/repos/' + this.org + '/' + repoName + '/hooks';
        const opts = {
            method:  'POST',
            uri:     uri,
            headers: {
                'Authorization': this.gitHubAuthToken,
                'User-Agent':    this.gitHubUserName
            },
            body:    {
                name:   "web",
                active: true,
                events: ["commit_comment", "push"],
                config: {
                    url:          webhookEndpoint,
                    content_type: "json"
                }
            },
            json:    true
        };

        const results = await rp(opts); // .then(function(results: any) {
        Log.info("GitHubAction::addWebhook(..) - success: " + results);
        return true;
    }

    /**
     * Creates a team for a groupName (e.g., cpsc310_team1).
     *
     * Returns the teamId (used by many other Github calls).
     *
     * @param teamName
     * @param permission 'admin', 'pull', 'push' // admin for staff, push for students
     * @returns {Promise<number>} team id
     */
    public async createTeam(teamName: string, permission: string): Promise<{teamName: string, githubTeamNumber: number, URL: string}> {

        Log.info("GitHubAction::createTeam( " + this.org + ", " + teamName + ", " + permission + ", ... ) - start");
        try {
            await this.checkDatabase(null, teamName);

            const teamNum = await this.getTeamNumber(teamName);
            if (teamNum > 0) {
                Log.info("GitHubAction::createTeam( " + teamName + ", ... ) - success; exists: " + teamNum);
                const config = Config.getInstance();
                const url = config.getProp(ConfigKey.githubHost) + "/orgs/" + config.getProp(ConfigKey.org) + "/teams/" + teamName;
                return {teamName: teamName, githubTeamNumber: teamNum, URL: url};
            } else {
                Log.info('GitHubAction::createTeam( ' + teamName + ', ... ) - does not exist; creating');
                const uri = this.apiPath + '/orgs/' + this.org + '/teams';
                const options = {
                    method:  'POST',
                    uri:     uri,
                    headers: {
                        'Authorization': this.gitHubAuthToken,
                        'User-Agent':    this.gitHubUserName,
                        'Accept':        'application/json'
                    },
                    body:    {
                        name:       teamName,
                        permission: permission
                    },
                    json:    true
                };
                const body = await rp(options);
                const id = body.id;
                const config = Config.getInstance();
                const url = config.getProp(ConfigKey.githubHost) + "/orgs/" + config.getProp(ConfigKey.org) + "/teams/" + teamName;
                // TODO: simplify callees by setting Team.URL here and persisting it (like we do with createRepo)
                Log.info("GitHubAction::createTeam(..) - success; new: " + id);
                return {teamName: teamName, githubTeamNumber: id, URL: url};
            }
        } catch (err) {
            // explicitly log this failure
            Log.error("GitHubAction::createTeam(..) - ERROR: " + err);
            throw err;
        }
    }

    /**
     * Add a set of Github members (their usernames) to a given team.
     *
     * @param teamName
     * @param githubTeamId
     * @param members: string[] // github usernames
     * @returns {Promise<GitTeamTuple>}
     */
    public async addMembersToTeam(teamName: string, githubTeamId: number, members: string[]): Promise<GitTeamTuple> {
        Log.info("GitHubAction::addMembersToTeam( " + teamName + ", ..) - start; id: " +
            githubTeamId + "; members: " + JSON.stringify(members));

        const promises: any = [];
        for (const member of members) {
            Log.info("GitHubAction::addMembersToTeam(..) - adding member: " + member);

            // PUT /teams/:id/memberships/:username
            const uri = this.apiPath + '/teams/' + githubTeamId + '/memberships/' + member;
            Log.info("GitHubAction::addMembersToTeam(..) - uri: " + uri);
            const opts = {
                method:  'PUT',
                uri:     uri,
                headers: {
                    'Authorization': this.gitHubAuthToken,
                    'User-Agent':    this.gitHubUserName,
                    'Accept':        'application/json'
                },
                json:    true
            };
            promises.push(rp(opts));
        }

        const results = await Promise.all(promises);
        Log.info("GitHubAction::addMembersToTeam(..) - success: " + JSON.stringify(results));

        return {teamName: teamName, githubTeamNumber: githubTeamId};
    }

    /**
     * NOTE: needs the team Id (number), not the team name (string)!
     *
     * @param teamId
     * @param repoName
     * @param permission ('pull', 'push', 'admin')
     * @returns {Promise<GitTeamTuple>}
     */
    public async addTeamToRepo(teamId: number, repoName: string, permission: string): Promise<GitTeamTuple> {

        Log.info("GitHubAction::addTeamToRepo( " + teamId + ", " + repoName + " ) - start");
        try {
            const uri = this.apiPath + '/teams/' + teamId + '/repos/' + this.org + '/' + repoName;
            Log.info("GitHubAction::addTeamToRepo(..) - URI: " + uri);
            const options = {
                method:  'PUT',
                uri:     uri,
                headers: {
                    'Authorization': this.gitHubAuthToken,
                    'User-Agent':    this.gitHubUserName,
                    'Accept':        'application/json'
                    // 'Accept':        'application/vnd.github.hellcat-preview+json'
                },
                body:    {
                    permission: permission
                },
                json:    true
            };

            await rp(options);
            Log.info("GitHubAction::addTeamToRepo(..) - success; team: " + teamId + "; repo: " + repoName);
            return {githubTeamNumber: teamId, teamName: 'NOTSETHERE'};

        } catch (err) {
            Log.error("GitHubAction::addTeamToRepo(..) - ERROR: " + err);
            throw err;
        }
    }

    /**
     * Gets the internal number for a team.
     *
     * Returns -1 if the team does not exist.
     *
     * @param {string} teamName
     * @returns {Promise<number>}
     */
    public async getTeamNumber(teamName: string): Promise<number> {

        Log.info("GitHubAction::getTeamNumber( " + teamName + " ) - start");

        try {
            let teamId = -1;
            const teamList = await this.listTeams();
            for (const team of teamList) {
                if (team.name === teamName) {
                    teamId = team.id;
                    Log.info("GitHubAction::getTeamNumber(..) - matched team: " + teamName + "; id: " + teamId);
                }
            }

            if (teamId <= 0) {
                Log.info('GitHubAction::getTeamNumber(..) - WARN: Could not find team: ' + teamName);
                return -1;
            } else {
                return teamId;
            }
        } catch (err) {
            Log.warn("GitHubAction::getTeamNumber(..) - could not match team: " + teamName + "; ERROR: " + err);
            return -1;
        }
    }

    /**
     * Gets the list of users on a team.
     *
     * Returns [] if the team does not exist or nobody is on the team.
     *
     * @param {string} teamNumber
     * @returns {Promise<number>}
     */
    public async getTeamMembers(teamNumber: number): Promise<string[]> {

        Log.info("GitHubAction::getTeamMembers( " + teamNumber + " ) - start");

        try {
            const uri = this.apiPath + '/teams/' + teamNumber + '/members';
            const options = {
                method:  'GET',
                uri:     uri,
                headers: {
                    'Authorization': this.gitHubAuthToken,
                    'User-Agent':    this.gitHubUserName,
                    'Accept':        'application/json'
                }
            };

            // NOTE: not sure how this will respond to paging if there are lots of members on the team
            const body = await rp(options);
            Log.info("GitHubAction::getTeamMembers(..) - success");
            const resp = JSON.parse(body);
            const ids: string[] = [];
            for (const result of resp) {
                ids.push(result.login);
            }

            return ids;
        } catch (err) {
            Log.warn("GitHubAction::getTeamMembers(..) - ERROR: " + JSON.stringify(err));
            // just return empy [] rather than failing
            return [];
        }
    }

    public async isOnAdminTeam(userName: string): Promise<boolean> {
        const isAdmin = await this.isOnTeam('admin', userName);
        Log.trace('GitHubAction::isOnAdminTeam( ' + userName + ' ) - result: ' + isAdmin);
        return isAdmin;
    }

    public async isOnStaffTeam(userName: string): Promise<boolean> {
        const isStaff = await this.isOnTeam('staff', userName);
        Log.trace('GitHubAction::isOnStaffTeam( ' + userName + ' ) - result: ' + isStaff);
        return isStaff;
    }

    private async isOnTeam(teamName: string, userName: string): Promise<boolean> {
        const gh = this;

        if (teamName !== 'staff' && teamName !== 'admin') {
            // sanity-check non admin/staff teams
            await this.checkDatabase(null, teamName);
        }

        const teamNumber = await gh.getTeamNumber(teamName);

        const teamMembers = await gh.getTeamMembers(teamNumber);
        for (const member of teamMembers) {
            if (member === userName) {
                Log.info('GitHubAction::isOnTeam(..) - user: ' + userName + ' IS on team: ' + teamName + ' for org: ' + gh.org);
                return true;
            }
        }

        Log.info('GitHubAction::isOnTeam(..) - user: ' + userName + ' is NOT on team: ' + teamName + ' for org: ' + gh.org);
        return false;
    }

    public async importRepoFS(importRepo: string, studentRepo: string, seedFilePath?: string): Promise<boolean> {
        Log.info('GitHubAction::importRepoFS( ' + importRepo + ', ' + studentRepo + ' ) - start');
        const that = this;

        function addGithubAuthToken(url: string) {
            const startAppend = url.indexOf('//') + 2;
            const token = that.gitHubAuthToken;
            const authKey = token.substr(token.indexOf('token ') + 6) + '@';
            // creates "longokenstring@githuburi"
            return url.slice(0, startAppend) + authKey + url.slice(startAppend);
        }

        const exec = require('child-process-promise').exec;
        const tempDir = await tmp.dir({dir: '/tmp', unsafeCleanup: true});
        const tempPath = tempDir.path;
        const authedStudentRepo = addGithubAuthToken(studentRepo);
        const authedImportRepo = addGithubAuthToken(importRepo);
        // this was just a github-dev testing issue; we might need to consider using per-org import test targets or something
        // if (importRepo === 'https://github.com/SECapstone/capstone' || importRepo === 'https://github.com/SECapstone/bootstrap') {
        //     authedImportRepo = importRepo; // HACK: for testing
        // }

        if (seedFilePath) {
            const tempDir2 = await tmp.dir({dir: '/tmp', unsafeCleanup: true});
            const tempPath2 = tempDir2.path;
            // First clone to a temporary directory
            // then move only the required files
            // then proceed as normal
            return cloneRepo(tempPath2).then(() => {
                return moveFiles(tempPath2, seedFilePath, tempPath)
                    .then(() => {
                        return enterRepoPath();
                    }).then(() => {
                        return removeGitDir();
                    }).then(() => {
                        return initGitDir();
                    }).then(() => {
                        return changeGitRemote();
                    }).then(() => {
                        return addFilesToRepo();
                    }).then(() => {
                        return pushToNewRepo();
                    }).then(() => {
                        return Promise.resolve(true); // made it cleanly
                    }).catch((err: any) => {
                        Log.error('GitHubAction::cloneRepo() - ERROR: ' + err);
                        return Promise.reject(err);
                    });
            });
        } else {
            return cloneRepo(tempPath).then(() => {
                return enterRepoPath()
                    .then(() => {
                        return removeGitDir();
                    }).then(() => {
                        return initGitDir();
                    }).then(() => {
                        return changeGitRemote();
                    }).then(() => {
                        return addFilesToRepo();
                    }).then(() => {
                        return pushToNewRepo();
                    }).then(() => {
                        return Promise.resolve(true); // made it cleanly
                    }).catch((err: any) => {
                        Log.error('GitHubAction::cloneRepo() - ERROR: ' + err);
                        return Promise.reject(err);
                    });
            });
        }

        function moveFiles(originPath: string, filesLocation: string, destPath: string) {
            Log.info('GitHubActions::importRepoFS(..)::moveFiles( ' + originPath + ', '
                + filesLocation + ', ' + destPath + ') - moving files');
            return exec(`cp -r ${originPath}/${filesLocation} ${destPath}`)
                .then(function(result: any) {
                    Log.info('GitHubActions::importRepoFS(..)::moveFiles(..) - done');
                    Log.trace('GitHubActions::importRepoFS(..)::moveFiles(..) - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::importRepoFS(..)::moveFiles(..) - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'importRepoFS(..)::moveFiles(..)');
                });
        }

        function cloneRepo(repoPath: string) {
            Log.info('GitHubActions::importRepoFS(..)::cloneRepo() - cloning: ' + importRepo);
            return exec(`git clone ${authedImportRepo} ${repoPath}`)
                .then(function(result: any) {
                    Log.info('GitHubActions::importRepoFS(..)::cloneRepo() - done:');
                    Log.trace('GitHubActions::importRepoFS(..)::cloneRepo() - stdout: ' + result.stdout);
                    that.reportStdErr(result.stderr, 'importRepoFS(..)::cloneRepo()');
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::importRepoFS(..)::cloneRepo() - stderr: ' + result.stderr);
                    // }
                });
        }

        function enterRepoPath() {
            Log.info('GitHubActions::importRepoFS(..)::enterRepoPath() - entering: ' + tempPath);
            return exec(`cd ${tempPath}`)
                .then(function(result: any) {
                    Log.info('GitHubActions::importRepoFS(..)::enterRepoPath() - done:');
                    Log.trace('GitHubActions::importRepoFS(..)::enterRepoPath() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::importRepoFS(..)::enterRepoPath() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'importRepoFS(..)::enterRepoPath()');
                });
        }

        function removeGitDir() {
            Log.info('GitHubActions::importRepoFS(..)::removeGitDir() - removing .git from cloned repo');
            return exec(`cd ${tempPath} && rm -rf .git`)
                .then(function(result: any) {
                    Log.info('GitHubActions::importRepoFS(..)::removeGitDir() - done:');
                    Log.trace('GitHubActions::importRepoFS(..)::removeGitDir() - stdout: ' + result.stdout);
                    // Log.trace('GitHubActions::importRepoFS(..)::removeGitDir() - stderr: ' + result.stderr);
                    that.reportStdErr(result.stderr, 'importRepoFS(..)::removeGitDir()');
                });
        }

        function initGitDir() {
            Log.info('GitHubActions::importRepoFS(..)::initGitDir() - start');
            return exec(`cd ${tempPath} && git init`)
                .then(function(result: any) {
                    Log.info('GitHubActions::importRepoFS(..)::initGitDir() - done:');
                    Log.trace('GitHubActions::importRepoFS(..)::initGitDir() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::importRepoFS(..)::initGitDir() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'importRepoFS(..)::initGitDir()');
                });
        }

        function changeGitRemote() {
            Log.info('GitHubActions::importRepoFS(..)::changeGitRemote() - start');
            const command = `cd ${tempPath} && git remote add origin ${authedStudentRepo}.git && git fetch --all`;
            return exec(command)
                .then(function(result: any) {
                    Log.info('GitHubActions::importRepoFS(..)::changeGitRemote() - done:');
                    Log.trace('GitHubActions::importRepoFS(..)::changeGitRemote() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::importRepoFS(..)::changeGitRemote() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'importRepoFS(..)::changeGitRemote()');
                });
        }

        function addFilesToRepo() {
            Log.info('GitHubActions::importRepoFS(..)::addFilesToRepo() - start');
            // tslint:disable-next-line
            const command = `cd ${tempPath} && git config user.email "classy@cs.ubc.ca" && git config user.name "classy" && git add . && git commit -m "Starter files"`;
            return exec(command)
                .then(function(result: any) {
                    Log.info('GitHubActions::importRepoFS(..)::addFilesToRepo() - done:');
                    Log.trace('GitHubActions::importRepoFS(..)::addFilesToRepo() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::importRepoFS(..)::addFilesToRepo() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'importRepoFS(..)::addFilesToRepo()');
                });
        }

        function pushToNewRepo() {
            Log.info('GitHubActions::importRepoFS(..)::pushToNewRepo() - start');
            const command = `cd ${tempPath} && git push origin master`;
            return exec(command)
                .then(function(result: any) {
                    Log.info('GitHubActions::importRepoFS(..)::pushToNewRepo() - done: ');
                    Log.trace('GitHubActions::importRepoFS(..)::pushToNewRepo() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::importRepoFS(..)::pushToNewRepo() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'importRepoFS(..)::pushToNewRepo()');
                });
        }
    }

    // just a useful delay function for when we need to wait for GH to do something
    // or we want a test to be able to slow itself down
    public async delay(ms: number): Promise<{}> {
        Log.info("GitHubActions::delay( " + ms + ") - start: " + Date.now());

        const fire = new Date(new Date().getTime() + ms);
        Log.info("GitHubAction::delay( " + ms + " ms ) - waiting; will trigger at " + fire.toLocaleTimeString());

        await setTimeout(null, ms);

        Log.info("GitHubActions::delay( " + ms + ") - done: " + Date.now());
        return;
    }

    public addGithubAuthToken(url: string) {
        const startAppend = url.indexOf('//') + 2;
        const token = this.gitHubAuthToken;
        const authKey = token.substr(token.indexOf('token ') + 6) + '@';
        // creates "longokenstring@githuburi"
        return url.slice(0, startAppend) + authKey + url.slice(startAppend);
    }

    private reportStdErr(stderr: any, prefix: string) {
        if (stderr) {
            Log.warn('GitHubActions::reportStdErr - ' + prefix + ': ' + stderr);
        }
    }

    /**
     * Adds a file with the data given, to the specified repository.
     * If force is set to true, will overwrite old files
     * @param {string} repoURL - name of repository
     * @param {string} fileName - name of file to write
     * @param {string} fileContent - the content of the file to write to repo
     * @param {boolean} force - allow for overwriting of old files
     * @returns {Promise<boolean>} - true if write was successful
     */
    public async writeFileToRepo(repoURL: string, fileName: string, fileContent: string, force: boolean = false): Promise<boolean> {
        Log.info("GithubAction::writeFileToRepo( " + repoURL + " , " + fileName + "" +
            " , " + fileContent + " , " + force + " ) - start");
        const that = this;

        // TAKEN FROM importFS

        // generate temp path
        const exec = require('child-process-promise').exec;
        const tempDir = await tmp.dir({dir: '/tmp', unsafeCleanup: true});
        const tempPath = tempDir.path;
        const authedRepo = this.addGithubAuthToken(repoURL);

        // clone repository
        try {
            await cloneRepo(tempPath);
            await enterRepoPath();
            if (force) {
                await createNewFileForce();
            } else {
                await createNewFile();
            }
            await addFilesToRepo();
            try {
                await commitFilesToRepo();
            } catch (err) {
                Log.warn("GithubActions::writeFileToRepo(..) - No file differences; " +
                    "Did not write file to repo");
                // this only fails when the files have not changed,
                return true;    // we technically "wrote" the file still
            }
            await pushToRepo();
        } catch (err) {
            Log.error("GithubActions::writeFileToRepo(..) - Error: " + err);
            return false;
        }

        return true;

        function cloneRepo(repoPath: string) {
            Log.info('GitHubActions::writeFileToRepo(..)::cloneRepo() - cloning: ' + repoURL);
            return exec(`git clone ${authedRepo} ${repoPath}`)
                .then(function(result: any) {
                    Log.info('GitHubActions::writeFileToRepo(..)::cloneRepo() - done:');
                    Log.trace('GitHubActions::writeFileToRepo(..)::cloneRepo() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::writeFileToRepo(..)::cloneRepo() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'writeFileToRepo(..)::cloneRepo()');
                });
        }

        function enterRepoPath() {
            Log.info('GitHubActions::writeFileToRepo(..)::enterRepoPath() - entering: ' + tempPath);
            return exec(`cd ${tempPath}`)
                .then(function(result: any) {
                    Log.info('GitHubActions::writeFileToRepo(..)::enterRepoPath() - done:');
                    Log.trace('GitHubActions::writeFileToRepo(..)::enterRepoPath() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::writeFileToRepo(..)::enterRepoPath() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'writeFileToRepo(..)::enterRepoPath()');
                });
        }

        function createNewFileForce() {
            Log.info('GitHubActions::writeFileToRepo(..)::createNewFileForce() - writing: ' + fileName);
            return exec(`cd ${tempPath} && if [ -f ${fileName} ]; then rm ${fileName};  fi; echo '${fileContent}' >> ${fileName};`)
                .then(function(result: any) {
                    Log.info('GitHubActions::writeFileToRepo(..)::createNewFileForce() - done:');
                    Log.trace('GitHubActions::writeFileToRepo(..)::createNewFileForce() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::writeFileToRepo(..)::createNewFileForce() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'writeFileToRepo(..)::createNewFileForce()');
                });
        }

        function createNewFile() {
            Log.info('GitHubActions::writeFileToRepo(..)::createNewFile() - writing: ' + fileName);
            return exec(`cd ${tempPath} && if [ ! -f ${fileName} ]; then echo \"${fileContent}\" >> ${fileName};fi`)
                .then(function(result: any) {
                    Log.info('GitHubActions::writeFileToRepo(..)::createNewFile() - done:');
                    Log.trace('GitHubActions::writeFileToRepo(..)::createNewFile() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::writeFileToRepo(..)::createNewFile() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'writeFileToRepo(..)::createNewFile()');
                });
        }

        function addFilesToRepo() {
            Log.info('GitHubActions::writeFileToRepo(..)::addFilesToRepo() - start');
            const command = `cd ${tempPath} && git add ${fileName}`;
            return exec(command)
                .then(function(result: any) {
                    Log.info('GitHubActions::writeFileToRepo(..)::addFilesToRepo() - done:');
                    Log.trace('GitHubActions::writeFileToRepo(..)::addFilesToRepo() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::writeFileToRepo(..)::addFilesToRepo() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'writeFileToRepo(..)::addFilesToRepo()');
                });
        }

        function commitFilesToRepo() {
            Log.info('GitHubActions::writeFileToRepo(..)::commitFilesToRepo() - start');
            const command = `cd ${tempPath} && git commit -m "Update ${fileName}"`;
            return exec(command)
                .then(function(result: any) {
                    Log.info('GitHubActions::writeFileToRepo(..)::commitFilesToRepo() - done:');
                    Log.trace('GitHubActions::writeFileToRepo(..)::commitFilesToRepo() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::writeFileToRepo(..)::commitFilesToRepo() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'writeFileToRepo(..)::commitFilesToRepo()');
                });
        }

        function pushToRepo() {
            Log.info('GitHubActions::writeFileToRepo(..)::pushToRepo() - start');
            const command = `cd ${tempPath} && git push`;
            return exec(command)
                .then(function(result: any) {
                    Log.info('GitHubActions::writeFileToRepo(..)::pushToNewRepo() - done: ');
                    Log.trace('GitHubActions::writeFileToRepo(..)::pushToNewRepo() - stdout: ' + result.stdout);
                    // if (result.stderr) {
                    //     Log.warn('GitHubActions::writeFileToRepo(..)::pushToNewRepo() - stderr: ' + result.stderr);
                    // }
                    that.reportStdErr(result.stderr, 'writeFileToRepo(..)::pushToNewRepo()');
                });
        }

    }

    /**
     * Changes permissions for all teams for the given repository
     * @param {string} repoName
     * @param {string} permissionLevel - one of: 'push' 'pull'
     * @returns {Promise<boolean>}
     */
    public async setRepoPermission(repoName: string, permissionLevel: string): Promise<boolean> {
        Log.info("GithubAction::setRepoPermission( " + repoName + ", " + permissionLevel + " ) - start");

        try {
            // Check if permissionLevel is one of: {push, pull}
            // We don't want to be able to grant a team admin access!
            if (permissionLevel !== "pull" && permissionLevel !== "push") {
                const msg = "GitHubAction::setRepoPermission(..) - ERROR, Invalid permissionLevel: " + permissionLevel;
                Log.error(msg);
                throw new Error(msg);
            }

            // Make sure the repo exists
            // tslint:disable-next-line:no-floating-promises
            const repoExists = await this.repoExists(repoName);
            if (repoExists) {
                Log.info("GitHubAction::setRepoPermission(..) - repo exists");
                Log.info("GitHubAction::setRepoPermission(..) - getting teams associated with repo");
                const teamsUri = this.apiPath + '/repos/' + this.org + '/' + repoName + '/teams';
                Log.trace("GitHubAction::setRepoPermission(..) - URI: " + teamsUri);
                const teamOptions = {
                    method:  'GET',
                    uri:     teamsUri,
                    headers: {
                        'Authorization': this.gitHubAuthToken,
                        'User-Agent':    this.gitHubUserName,
                        'Accept':        'application/json'
                    },
                    json:    true
                };

                // Change each team's permission
                // tslint:disable-next-line:no-floating-promises
                const responseData = await rp(teamOptions); // .then(function(responseData: any) {
                Log.info("GitHubAction::setRepoPermission(..) - setting permission for teams on repo");
                for (const team of responseData) {
                    // Don't change teams that have admin permission
                    if (team.permission !== "admin") {
                        Log.info("GitHubAction::setRepoPermission(..) - set team: " + team.name + " to " + permissionLevel);
                        const permissionUri = this.apiPath + '/teams/' + team.id + '/repos/' + this.org + '/' + repoName;
                        Log.trace("GitHubAction::setRepoPermission(..) - URI: " + permissionUri);
                        const permissionOptions = {
                            method:  'PUT',
                            uri:     permissionUri,
                            headers: {
                                'Authorization': this.gitHubAuthToken,
                                'User-Agent':    this.gitHubUserName,
                                'Accept':        'application/json'
                            },
                            body:    {
                                permission: permissionLevel
                            },
                            json:    true
                        };

                        await rp(permissionOptions); // TODO: evaluate statusCode from this call
                        Log.info("GitHubAction::setRepoPermission(..) - changed team: " + team.id + " permissions");
                    }
                }
            } else {
                Log.info("GitHubAction::setRepoPermission(..) - repo does not exists; unable to revoke push");
                return false;
            }
        } catch (err) {
            // If we get an error; something went wrong
            Log.error("GitHubAction::setRepoPermission(..) - ERROR: " + err.message);
            throw err;
        }
    }

    /**
     * Checks to make sure the repoName or teamName (or both, if specified) are in the database.
     *
     * This is like an assertion that should be picked up by tests, although it should never
     * happen in production (if our suite is any good).
     *
     * NOTE: ASYNC FUNCTION!
     *
     * @param {string | null} repoName
     * @param {string | null} teamName
     * @returns {Promise<boolean>}
     */
    private async checkDatabase(repoName: string | null, teamName: string | null): Promise<boolean> {
        Log.trace("GitHubActions::checkDatabase( repo:_" + repoName + "_, team:_" + teamName + "_) - start");
        const dbc = DatabaseController.getInstance();
        if (repoName !== null) {
            const repo = await dbc.getRepository(repoName);
            if (repo === null) {
                const msg = "Repository: " + repoName +
                    " does not exist in datastore; make sure you add it before calling this operation";
                Log.error("GitHubActions::checkDatabase() - repo ERROR: " + msg);
                throw new Error(msg);
            } else {
                // ensure custom property is there
                if (typeof repo.custom === 'undefined' || repo.custom === null || typeof repo.custom !== 'object') {
                    const msg = "Repository: " + repoName + " has a non-object .custom property";
                    Log.error("GitHubActions::checkDatabase() - repo ERROR: " + msg);
                    throw new Error(msg);
                }
            }
        }

        if (teamName !== null) {
            const team = await dbc.getTeam(teamName);
            if (team === null) {
                const msg = "Team: " + teamName +
                    " does not exist in datastore; make sure you add it before calling this operation";
                Log.error("GitHubActions::checkDatabase() - team ERROR: " + msg);
                throw new Error(msg);
            } else {
                // ensure custom property is there
                if (typeof team.custom === 'undefined' || team.custom === null || typeof team.custom !== 'object') {
                    const msg = "Team: " + teamName + " has a non-object .custom property";
                    Log.error("GitHubActions::checkDatabase() - team ERROR: " + msg);
                    throw new Error(msg);
                }
            }
        }
        Log.trace("GitHubActions::checkDatabase( repo:_" + repoName + "_, team:_" + teamName + "_) - exists");
        return true;
    }

}
