import * as fs from "fs-extra";
import * as restify from "restify";
import { URL } from "url";
import {DockerContainer, IDockerContainer} from "../docker/DockerContainer";
import {Repository} from "../git/Repository";
import { ContainerFirewall, IContainerFirewall } from "../network/ContainerFirewall";
import { FirewallController } from "../network/FirewallController";
import { IContainerOutput, IDockerContainerOptions, IGradeReport, IGradeTask } from "../Types";
import Log from "../util/Log";
import { ISocketServer, SocketServer } from "./SocketServer";

export default class RouteHandler {

    // notification service
    // worker pool service
    // archive service
    // container comm service

    // assume firewall config'd
    public static containerSocketServer: ISocketServer = new SocketServer(Number(process.env.SOCK_PORT));

    public static async handleContainerMessage(message: string, containerFirewall: IContainerFirewall): Promise<string> {
        if (message.toUpperCase().startsWith("NET ALLOW ")) {
            try {
                const rawUrl: string = message.substr(9);
                const url = new URL(rawUrl);
                await containerFirewall.unblock(url.host, Number(url.port));
                return "SUCCESS";
            } catch (err) {
                Log.error(`RouteHandler::handleContainerMessage(..) - ${err}`);
                return "INVALID_URL";
            }
        } else {
            Log.warn(`RouteHandler::handleContainerMessage(..) - Unsupported or invalid message from client: ${message}`);
            return "INVALID_MSG";
        }
    }

    public static async postGradingTask(req: restify.Request, res: restify.Response, next: restify.Next) {
        let execId: string;
        let state: string;
        let cntrCode: number;
        const out: IContainerOutput = {
            commitUrl: req.body.assn.url,
            timestamp: Date.now(),
            report: null,
            feedback: "",
            postbackOnComplete: false,
            custom: {},
            attachments: [],
            state: "SUCCESS"
        };

        try {
            const body: IGradeTask = req.body;
            execId = body.execId;

            const net: string = process.env.DOCKER_NET;
            const assnToken = process.env.GH_ORG_TOKEN;
            const solnToken = process.env.GH_ORACLE_TOKEN;
            const hostUID = process.env.HOST_UID;
            const sockPort = process.env.SOCK_PORT;
            const tempDir: string = process.env.TEMP_DIR + "/" + execId;
            const keepDir: string = process.env.ARCHIVE_DIR + "/" + execId;

            const assnDir: string = `${tempDir}/assignment`;
            const solnDir: string = `${tempDir}/solution`;

            Log.info("Making directories");
            const mkdirPromises: Array<Promise<void>> = [];
            // mkdirPromises.push(fs.mkdirp(assnDir));
            // mkdirPromises.push(fs.mkdirp(solnDir));
            mkdirPromises.push(fs.mkdirp(tempDir));
            mkdirPromises.push(fs.mkdirp(keepDir));
            await Promise.all(mkdirPromises);


            const assnRepo: Repository = new Repository(assnDir);
            const assnUrl: string = body.assn.url.replace("://", `://${assnToken}@`);
            const assnCommit: string = body.assn.commit;
            await assnRepo.clone(assnUrl);
            Log.info(`Cloning from ${assnUrl} to ${assnDir} commit ${assnCommit}`);
            if (typeof assnCommit !== `undefined`) {
                await assnRepo.checkout(assnCommit);
            }

            console.log(fs.readdirSync(assnDir));

            Log.info("Getting soln repo");
            const solnRepo: Repository = new Repository(solnDir);
            const solnUrl: string = body.soln.url.replace("://", `://${solnToken}@`);
            const solnRef: string = body.soln.branch;
            await solnRepo.clone(solnUrl);
            if (typeof solnRef !== `undefined`) {
                await solnRepo.checkout(solnRef);
            }

            // Container stuff
            Log.info("Creating container");
            const img: string = body.container.image;
            const cntr: IDockerContainer = new DockerContainer(img);
            const containerOptions: IDockerContainerOptions = {
                "--env": [`ASSIGNMENT=${body.assnId}`, `USER_UID=${hostUID}`, `HOST_NAME=172.28.2.0`, `HOST_PORT=${sockPort}`],
                "--volume": [`${tempDir}:/input`, `${keepDir}:/archive`],
                "--network": net
            };
            await cntr.create(containerOptions);
            await cntr.start();
            const [, cntrAddr] = await cntr.inspect("{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}");

            Log.info(`Container ${cntr.id.substring(0, 7)} started with IP ${cntrAddr}`);

            // Handle messages from the container if it ever sends a message but don't block waiting
            if (!RouteHandler.containerSocketServer.isListening) {
                Log.info("Starting socket server");
                await RouteHandler.containerSocketServer.start();
                Log.info("DONE");
            }
            const fwId: string = cntr.id.substring(0, 7);
            const cntrFirewall: IContainerFirewall = new ContainerFirewall(fwId, cntrAddr, new FirewallController());
            let socket: any;
            Log.info("Register container socket listener");
            RouteHandler.containerSocketServer.getSocket(cntrAddr).then((sock) => {
                socket = sock;
                socket.on("data", async (data: string) => {
                    const response = await RouteHandler.handleContainerMessage(data, cntrFirewall);
                    socket.write(response);
                    socket.end();
                });
            });

            Log.info("Register timeout");
            // Set a timer to kill the container if it doesn't finish in the time alloted
            const timeout = body.container.timeout;
            let didFinish = false;
            let didTimeout = false;
            if (timeout > 0) {
                setTimeout(async () => {
                    if (!didFinish) {
                        didTimeout = true;
                        await cntr.stop();
                    }
                }, timeout);
            }

            const [, cmdOut] = await cntr.wait();
            cntrCode = Number(cmdOut);
            Log.info("Container done with code " + cntrCode);
            didFinish = true;
            if (didTimeout) {
                state = "TIMEOUT";
            }
            let [, log] = await cntr.logs();
            if (typeof body.container.logSize !== "undefined") {
                log = log.substring(0, body.container.logSize);
            }
            fs.writeFile(`${keepDir}/stdio.txt`, log);
            Log.info("Route Done");

            // Generate response
            try {
                if (state === "TIMEOUT") {
                    out.feedback = "Container did not complete in the allotted time.";
                    out.postbackOnComplete = true;
                    out.state = "TIMEOUT";
                } else {
                    const report: IGradeReport = await fs.readJson(`${keepDir}/report.json`);
                    out.report = report;
                    out.feedback = report.feedback;
                    out.postbackOnComplete = cntrCode !== 0;
                    out.state = "SUCCESS";
                }
            } catch (err) {
                Log.warn(`RouteHandler::postGradingTask(..) - ERROR Reading grade report. ${err}`);
                out.feedback = "Failed to read grade report.";
                out.state = "INVALID_REPORT";
            }
        } catch (err) {
            Log.warn(`RouteHandler::postGradingTask(..) - ERROR Processing ${execId}. ${err}`);
            out.feedback = "Error running container.";
            out.state = "FAIL";
        } finally {
            res.json(200, out);
        }
    }
}

        // const out: IContainerOutput = {
        //     commitUrl:          input.pushInfo.commitURL,
        //     timestamp:          Date.now(),
        //     report:             null,
        //     feedback:           null,
        //     postbackOnComplete: true,
        //     custom:             {},
        //     attachments:        [],
        //     state:              "FAIL" // enum: SUCCESS, TIMEOUT, INVALID_REPORT, FAIL
        // };

        // const gradeReport: IGradeReport = {
        //     scoreOverall: 67.7,
        //     scoreTest: 65.8,
        //     scoreCover: 87.3,
        //     passNames: ["p1", "p2"],
        //     failNames: ["f1"],
        //     errorNames: [],
        //     skipNames: [],
        //     custom:  [],
        //     feedback: "Mock grade report",
        // };
