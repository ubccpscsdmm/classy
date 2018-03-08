const loadFirst = require('./GlobalSpec');

import {IClassPortal} from "../src/autotest/ClassPortal";
import {GithubService} from "../src/github/GithubService";
import {GithubAutoTest} from "../src/github/GithubAutoTest";
import {ICommentEvent, IFeedbackGiven, IPushEvent} from "../src/Types";
import {TestData} from "./TestData";
import Log from "../src/util/Log";

import {expect} from "chai";
import * as fs from "fs-extra";
import "mocha";
import {Config} from "../src/Config";
import Util from "../src/util/Util";
import {MockClassPortal} from "../src/autotest/mocks/MockClassPortal";
import {MockDataStore} from "../src/autotest/mocks/MockDataStore";


describe("GithubAutoTest", () => {

    Config.getInstance("test");
    let pushes: IPushEvent[];
    let data: MockDataStore;
    let portal: IClassPortal;
    let gh: GithubService;
    let at: GithubAutoTest;

    // now: 1516559187579
    // now -10h: 1516523258762
    // now - 24h: 1516472872288

    before(function () {
        Log.test("AutoTest::before() - start");

        pushes = fs.readJSONSync("./test/pushes.json");

        data = new MockDataStore();
        data.clearData();

        portal = new MockClassPortal();
        gh = new GithubService();
        const courseId = "310";
        at = new GithubAutoTest(courseId, data, portal, gh);

        (<any>Config.getInstance()).config.postback = false;
    });

    beforeEach(function () {
        Log.test("AutoTest::beforeEach() - start");
        data.clearData();
    });

    afterEach(async function () {
        // pause after each test so async issues don't persist
        // this is a hack, but makes the tests more deterministic
        Log.test("AutoTest::afterEach() - start");
        await Util.timeout(100);
        Log.test("AutoTest::afterEach() - done");
    });

    it("Should be able to be instantiated.", () => {
        expect(at).not.to.equal(null);
        expect(pushes.length).to.equal(9);
    });

    it("Should be able to receive multiple pushes.", async () => {
        expect(at).not.to.equal(null);

        const pe: IPushEvent = pushes[0];
        let allData = await data.getAllData();
        expect(allData.pushes.length).to.equal(0);
        await at.handlePushEvent(pe);
        await at.handlePushEvent(pushes[1]);
        await at.handlePushEvent(pushes[2]);
        await at.handlePushEvent(pushes[3]);
        await at.handlePushEvent(pushes[4]);
        await at.handlePushEvent(pushes[5]);
        allData = await data.getAllData();
        expect(allData.pushes.length).to.equal(6);
    });

    it("Should be able to receive multiple concurrent pushes.", async () => {
        expect(at).not.to.equal(null);

        const pe: IPushEvent = pushes[0];
        const arr = [];
        arr.push(at.handlePushEvent(pushes[0]));
        arr.push(at.handlePushEvent(pushes[1]));
        arr.push(at.handlePushEvent(pushes[2]));
        arr.push(at.handlePushEvent(pushes[3]));
        arr.push(at.handlePushEvent(pushes[4]));
        arr.push(at.handlePushEvent(pushes[5]));

        await Promise.all(arr);
        const allData = await data.getAllData();
        // expect(allData.pushes.length).to.equal(6);
    });

    it("Should be able to receive a comment event.", async () => {
        expect(at).not.to.equal(null);

        const pe: IPushEvent = pushes[0];
        const ce: ICommentEvent = {
            botMentioned:  false,
            commitSHA:     pe.commitSHA,
            commitURL:     pe.commitURL,
            personId:      "myUser",
            org:           "310",
            delivId:       "d0",
            "postbackURL": "https://github.ugrad.cs.ubc.ca/api/v3/repos/CPSC310-2017W-T2/d1_project9999/commits/d5f2203cfa1ae43a45932511ce39b2368f1c72ed/comments",
            timestamp:     1234567891
        };

        let allData = await data.getAllData();
        expect(allData.comments.length).to.equal(0);
        await at.handleCommentEvent(ce);
        allData = await data.getAllData();
        expect(allData.comments.length).to.equal(0);

        // await Util.timeout(1 * 1000); // let test finish so it doesn't ruin subsequent executions
    });

    it("Should give a user a warning message on a commit that has not been queued.", async () => {
        // This case happens when a comment is made on a commit that AutoTest did not see the push for
        expect(at).not.to.equal(null);

        // start fresh
        data.clearData();
        gh.messages = [];

        // SETUP: add a push with no output records
        // await data.savePush(inputRecordA);
        let allData = await data.getAllData();
        expect(gh.messages.length).to.equal(0); // should not generate feedback
        expect(allData.pushes.length).to.equal(0);
        Log.test("Setup complete");

        // TEST: send a comment
        await at.handleCommentEvent(TestData.commentRecordUserA);
        allData = await data.getAllData();
        expect(gh.messages.length).to.equal(1); // should generate a warning
        expect(gh.messages[0].message).to.equal("This commit is has not been queued; please make and push a new commit.");
        expect(allData.comments.length).to.equal(1); // comment event should not have been saved
    });

    it("Should give a user a 'still processing' message on a commit that has not been finished.", async () => {
        // This case happens when a comment is made on a commit that AutoTest did not see the push for
        expect(at).not.to.equal(null);

        // start fresh
        data.clearData();
        gh.messages = [];

        // SETUP: add a push with no output records
        await at.handlePushEvent(TestData.pushEventA);
        let allData = await data.getAllData();
        expect(gh.messages.length).to.equal(0); // should not be any feedback yet
        expect(allData.pushes.length).to.equal(1);
        Log.test("Setup complete");

        // TEST: send a comment
        await at.handleCommentEvent(TestData.commentRecordUserA);
        allData = await data.getAllData();
        expect(gh.messages.length).to.equal(1); // should generate a warning
        expect(gh.messages[0].message).to.equal("This commit is still queued for processing against d1. Your results will be posted here as soon as they are ready.");
        expect(allData.comments.length).to.equal(1);

        await Util.timeout(200); // just clear the buffer before moving onto the next test
    });

    it("Should give a user a response for on a commit once it finishes if they have previously requested it.", async () => {
        // This case happens when a comment is made on a commit that AutoTest did not see the push for
        expect(at).not.to.equal(null);

        // start fresh
        data.clearData();
        gh.messages = [];

        // SETUP: add a push with no output records
        await at.handlePushEvent(TestData.pushEventA);
        let allData = await data.getAllData();
        expect(gh.messages.length).to.equal(0); // should not be any feedback yet
        expect(allData.comments.length).to.equal(0);
        expect(allData.pushes.length).to.equal(1);
        // don't wait; want to catch this push in flight
        Log.test("Setup complete");

        // TEST: send a comment (this is the previous test)
        await at.handleCommentEvent(TestData.commentRecordUserA);
        allData = await data.getAllData();
        expect(gh.messages.length).to.equal(1); // should generate a warning
        expect(gh.messages[0].message).to.equal("This commit is still queued for processing against d1. Your results will be posted here as soon as they are ready.");
        expect(allData.comments.length).to.equal(1);
        expect(allData.feedback.length).to.equal(0); // don't charge for feedback until it is given
        await Util.timeout(200); // Wait for it!
        Log.test("Round 1 complete");

        allData = await data.getAllData();
        expect(gh.messages.length).to.equal(2); // should generate a warning
        expect(gh.messages[1].message).to.equal("Test execution complete.");
        expect(allData.comments.length).to.equal(1);
        expect(allData.feedback.length).to.equal(1); // should be charged
        Log.test("Test complete");
    });

    it("Should give a user a response for on a commit once it finishes if postback is true.", async () => {
        // This case happens when a comment is made on a commit that AutoTest did not see the push for
        expect(at).not.to.equal(null);

        // start fresh
        data.clearData();
        gh.messages = [];

        // SETUP: add a push with no output records
        await at.handlePushEvent(TestData.pushEventPostback);
        let allData = await data.getAllData();
        expect(gh.messages.length).to.equal(0); // should not be any feedback yet
        expect(allData.comments.length).to.equal(0);
        expect(allData.pushes.length).to.equal(1);
        Log.test("Setup complete");

        // TEST: send a comment (this is the previous test)
        // await at.handleCommentEvent(commentRecordUserA);
        // allData = await data.getAllData();
        // expect(gh.messages.length).to.equal(1); // should generate a warning
        // expect(gh.messages[0].message).to.equal("This commit is still queued for processing against d1. Your results will be posted here as soon as they are ready.");
        // expect(allData.comments.length).to.equal(1);
        // expect(allData.feedback.length).to.equal(0); // don't charge for feedback until it is given

        // Wait for it!
        await Util.timeout(100);
        allData = await data.getAllData();
        expect(gh.messages.length).to.equal(1); // should post response
        expect(gh.messages[0].message).to.equal("Build Problem Encountered.");
        expect(allData.comments.length).to.equal(0);
        expect(allData.feedback.length).to.equal(0); // no charge
    });

    it("Should give a user a response for on a commit once it finishes if postback is true. They should not be charged if they requested this build.", async () => {
        // This case happens when a comment is made on a commit that AutoTest did not see the push for
        expect(at).not.to.equal(null);

        // start fresh
        data.clearData();
        gh.messages = [];

        // SETUP: add a push with no output records
        await at.handlePushEvent(TestData.pushEventPostback);
        let allData = await data.getAllData();
        expect(gh.messages.length).to.equal(0); // should not be any feedback yet
        expect(allData.comments.length).to.equal(0);
        expect(allData.pushes.length).to.equal(1);
        Log.test("Setup complete");

        // TEST: send a comment (this is the previous test)
        await at.handleCommentEvent(TestData.commentRecordUserA);
        allData = await data.getAllData();
        expect(gh.messages.length).to.equal(1); // should generate a warning
        expect(gh.messages[0].message).to.equal("This commit is still queued for processing against d1. Your results will be posted here as soon as they are ready.");
        expect(allData.comments.length).to.equal(1);
        expect(allData.feedback.length).to.equal(0); // don't charge for feedback until it is given

        // Wait for it!
        await Util.timeout(100);
        allData = await data.getAllData();
        expect(gh.messages.length).to.equal(2); // should post response
        expect(gh.messages[1].message).to.equal("Build Problem Encountered.");
        expect(allData.comments.length).to.equal(1);
        expect(allData.feedback.length).to.equal(0); // no charge
    });

    it("Should give a user the results message on a commit that has been finished.", async () => {
        // This case happens when a comment is made on a commit that AutoTest did not see the push for
        expect(at).not.to.equal(null);

        // start fresh
        data.clearData();
        gh.messages = [];

        // SETUP: add a push with no output records
        await at.handlePushEvent(TestData.pushEventA);
        let allData = await data.getAllData();
        expect(gh.messages.length).to.equal(0); // should not be any feedback yet
        expect(allData.pushes.length).to.equal(1);
        expect(allData.feedback.length).to.equal(0);
        await Util.timeout(200); // should be long enough for processing to finish
        Log.test("Setup complete");

        // TEST: send a comment
        await at.handleCommentEvent(TestData.commentRecordUserA);
        allData = await data.getAllData();
        expect(gh.messages.length).to.equal(1); // should generate a warning
        expect(gh.messages[0].message).to.equal("Test execution complete."); // would really be the whole message
        expect(allData.comments.length).to.equal(1);
        expect(allData.feedback.length).to.equal(1); // user should have been charged
        Log.test("First request complete; starting second.");

        // FOLLOWUP: do it again, user should be given result for free since they previously asked
        await at.handleCommentEvent(TestData.commentRecordUserA);
        allData = await data.getAllData();
        expect(gh.messages.length).to.equal(2); // should return the row
        expect(gh.messages[0].message).to.equal("Test execution complete."); // would really be the whole message
        expect(allData.comments.length).to.equal(2);
        expect(allData.feedback.length).to.equal(2);
        Log.test("Test complete.");
    });

    // TODO: figure out what the difference is here
    it.skip("Should not let a user request results too soon.", async () => {
        // This case happens when a comment is made on a commit that AutoTest did not see the push for
        expect(at).not.to.equal(null);

        // start fresh
        data.clearData();
        gh.messages = [];

        // SETUP: add a push with no output records
        const fg: IFeedbackGiven = {
            "commitURL": "https://github.ugrad.cs.ubc.ca/CPSC310-2017W-T2/d0_team999/commit/abe1b0918b872997de4c4d2baf4c263fSOMEOTHER",
            "org":       "310",
            "delivId":   "d1",
            "timestamp": 1516451273288, ///
            "personId":  "cs310test"
        };
        data.savePush(TestData.inputRecordA);
        data.saveOutputRecord(TestData.outputRecordA);
        data.saveFeedbackGivenRecord(fg);
        let allData = await data.getAllData();
        expect(allData.comments.length).to.equal(0);
        expect(allData.feedback.length).to.equal(1); // the feedback record we inserted from a recent past request
        Log.test("Setup complete");

        // TEST: send a comment
        await at.handleCommentEvent(TestData.commentRecordUserA);
        allData = await data.getAllData();
        expect(gh.messages.length).to.equal(1); // should generate a warning
        expect(gh.messages[0].message).to.equal("You must wait 6 hours and 0 minutes before requesting feedback."); // would really be the whole message
        expect(allData.comments.length).to.equal(0); // doesn't count as a comment, user has to ask again once they are in-quota
        expect(allData.feedback.length).to.equal(1); // no extra feedback records should be present

        Log.test("Test complete.");
    });

    it.skip("Should let a user request results without specifying delivId.", async () => {
        return;
    });

    it.skip("Should let a user request results for a delivId other than the default.", async () => {
        return;
    });

    it.skip("Should let a user request results that promotes a push to the express queue.", async () => {
        return;
    });

    it.skip("Should let a staff request results without being rate limited.", async () => {
        return;
    });

    it.skip("Should ignore comments made by @autobot.", async () => {
        return;
    });

    it.skip("Should ignore comments that don't mention @autobot.", async () => {
        return;
    });


});