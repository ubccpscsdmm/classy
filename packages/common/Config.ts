import Log from "./Log";

export class Config {

    public static getInstance(configName?: string): Config {
        if (Config.instance === null) {
            const c = new Config();
            Config.instance = c;
        }
        return Config.instance;
    }

    protected static instance: Config = null;

    private config: any;

    private constructor() {
        // should not be called by clients but typescript does not allow private constructors
        try {
            this.config = {
                name: process.env.NAME,
                org: process.env.ORG,
                dockerId: process.env.GRADER_DOCKER_ID,
                workspace: process.env.GRADER_WORKSPACE,
                postback: Boolean(process.env.AUTOTEST_POSTBACK),
                persistDir: process.env.GRADER_PERSIST_DIR,
                port: Number(process.env.AUTOTEST_PORT),
                kind: process.env.KIND,
                timeout: Number(process.env.GRADER_TIMEOUT),
                botName: process.env.GH_BOT_USERNAME,
                githubOrgToken: process.env.GH_BOT_TOKEN,
                githubOracleToken: process.env.GH_ORG_TOKEN,
                sslCertPath: process.env.SSL_CERT_PATH,
                sslKeyPath: process.env.SSL_KEY_PATH,
                classPortalHost: process.env.SERVER_URL,
                classPortalPort: process.env.BACKEND_PORT,
                graderHost: process.env.SERVER_URL,
                graderPort: process.env.GRADER_PORT,
                mongoUrl: process.env.DB_URL,
                frontendPort:       process.env.FRONTEND_PORT,
                frontendUrl:        process.env.SERVER_URL,
                backendPort:        process.env.BACKEND_PORT,
                backendUrl:         process.env.SERVER_URL,
                githubHost:         process.env.GH_HOST,
                githubAPI:          process.env.GH_API,
                githubTokenUser:    process.env.GH_BOT_USERNAME,
                githubToken:        process.env.GH_BOT_TOKEN,
                autotestUrl:        process.env.SERVER_URL,
                autotestPort:       process.env.AUTOTEST_PORT,
                githubClientId:     process.env.GH_CLIENT_ID,
                githubClientSecret: process.env.GH_CLIENT_SECRET,

                // Not used?
                sslIntCert:         process.env.SSL_INT_CERT,
                adminUser: process.env.ADMIN_USER,
                oracleRepo: process.env.ORACLE_REPO,


            };
        } catch (err) {
            Log.error("Config::<init> - fatal error reading configuration file: " + err);
        }
    }

    public getProp(prop: string): any {
        if (typeof this.config[prop] === "undefined") {
            Log.error("Config::getProp( " + prop + " ) - property is undefined; you probably want this in your config file.");
        } else if (this.config[prop] === null) {
            Log.error("Config::getProp( " + prop + " ) - property is null");
        } else {
            return this.config[prop];
        }
        return null;
    }

}