import {CommitTarget, IAutoTestResult, IContainerInput, IFeedbackGiven} from "../../common/types/AutoTestTypes";

export class TestData {
    public static readonly pushEventA: CommitTarget = {
        cloneURL:     "",
        commitSHA:    "abe1b0918b872997de4c4d2baf4c263f8d4c6dc2",
        commitURL:    "https://github.ugrad.cs.ubc.ca/CPSC310-2017W-T2/d0_team999/commit/abe1b0918b872997de4c4d2baf4c263f8d4c6dc2",
        postbackURL:  "EMPTY",
        repoId:       "d0_team999",
        timestamp:    1516472872288,
        botMentioned: false,
        personId:     null,
        delivId:      "d0"
    };

    public static readonly pushEventB: CommitTarget = {
        // "branch":      "master",
        cloneURL:     "",
        commitSHA:    "eventb0918b872997de4c4d2baf4c263f8d4c6dc2",
        commitURL:    "https://github.ugrad.cs.ubc.ca/CPSC310-2017W-T2/d0_team999/commit/eventb0918b872997de4c4d2baf4c263f8d4c6dc2",
        postbackURL:  "EMPTY",
        repoId:       "d0_team999",
        timestamp:    1516992872288,
        botMentioned: false,
        personId:     null,
        delivId:      "d0"
    };

    public static readonly pushEventPostback: CommitTarget = {
        // "branch":      "master",
        cloneURL:     "",
        commitSHA:    "abe1b0918b872997de4c4d2baf4c263f8d4c6dc2",
        commitURL:    "https://github.ugrad.cs.ubc.ca/CPSC310-2017W-T2/d0_team999/commit/abe1b0918b872997de4c4d2baf4c263f8d4c6dc2",
        // "projectURL": "https://github.ugrad.cs.ubc.ca/CPSC310-2017W-T2/d0_team999/",
        postbackURL:  "POSTBACK",
        repoId:       "d0_team999",
        timestamp:    1516472872288,
        botMentioned: false,
        personId:     null,
        delivId:      "d0"
    };

    public static readonly inputRecordA: IContainerInput = {
        delivId:         "d0",
        containerConfig: {
            dockerImage:        "imageName",
            studentDelay:       300,
            maxExecTime:        6000,
            regressionDelivIds: [],
            custom:             {}
        },
        pushInfo:        TestData.pushEventA
    };

    public static readonly inputRecordB: IContainerInput = {
        delivId:         "d0",
        containerConfig: {
            dockerImage:        "imageName",
            studentDelay:       300,
            maxExecTime:        6000,
            regressionDelivIds: [],
            custom:             {}
        },
        pushInfo:        TestData.pushEventB
    };

    public static readonly commentRecordUserA: CommitTarget = {
        botMentioned: true,
        commitSHA:    "abe1b0918b872997de4c4d2baf4c263f8d4c6dc2",
        commitURL:    "https://github.ugrad.cs.ubc.ca/CPSC310-2017W-T2/d0_team999/commit/abe1b0918b872997de4c4d2baf4c263f8d4c6dc2",
        personId:     "cs310test",
        repoId:       "d0_team999",
        delivId:      "d1",
        postbackURL:  "EMPTY",
        cloneURL:     "https://cloneURL",
        timestamp:    1516472873288
    };

    public static readonly commentRecordUserATooSoon: CommitTarget = {
        botMentioned: true,
        commitSHA:    "abe1b0918b872997de4c4d2baf4c263f8d4c6dc2",
        commitURL:    "https://github.ugrad.cs.ubc.ca/CPSC310-2017W-T2/d0_team999/commit/abe1b0918b872997de4c4d2baf4c263f8d4c6dc2",
        personId:     "cs310test",
        repoId:       "d0_team999",
        delivId:      "d1",
        postbackURL:  "EMPTY",
        cloneURL:     "https://cloneURL",
        timestamp:    1516523258762
    };

    public static readonly commentRecordStaffA: CommitTarget = {
        botMentioned: true,
        commitSHA:    "abe1b0918b872997de4c4d2baf4c263f8d4staff",
        commitURL:    "https://github.ugrad.cs.ubc.ca/CPSC310-2017W-T2/d0_team999/commit/abe1b0918b872997de4c4d2baf4c263f8d4staff",
        personId:     "staff",
        repoId:       "d0_team999",
        delivId:      "d1",
        postbackURL:  "EMPTY",
        cloneURL:     "https://cloneURL",
        timestamp:    1516472874288
    };

    public static readonly feedbackRecordA: IFeedbackGiven = {
        personId:  TestData.commentRecordStaffA.personId,
        // org:       TestData.commentRecordStaffA.org,
        delivId:   TestData.commentRecordStaffA.delivId,
        timestamp: TestData.commentRecordStaffA.timestamp + 1000,
        commitURL: TestData.commentRecordStaffA.commitURL
    };

    public static readonly feedbackRecordB: IFeedbackGiven = {
        personId:  TestData.commentRecordUserA.personId,
        // org:       TestData.commentRecordUserA.org,
        delivId:   TestData.commentRecordUserA.delivId,
        timestamp: TestData.commentRecordUserA.timestamp + 1000,
        commitURL: TestData.commentRecordUserA.commitURL
    };

    public static readonly outputRecordA: IAutoTestResult = {
        delivId:   TestData.inputRecordA.delivId,
        repoId:    TestData.inputRecordA.pushInfo.repoId,
        // "timestamp": TestData.inputRecordA.pushInfo.timestamp,
        commitURL: "https://github.ugrad.cs.ubc.ca/CPSC310-2017W-T2/d0_team999/commit/abe1b0918b872997de4c4d2baf4c263f8d4c6dc2",
        commitSHA: "abe1b0918b872997de4c4d2baf4c263f8d4c6dc2",
        input:     TestData.inputRecordA,
        output:    {
            timestamp:          1516523418918,
            report:             {
                scoreOverall: 50,
                scoreTest:    50,
                scoreCover:   50,
                passNames:    [],
                failNames:    [],
                errorNames:   [],
                skipNames:    [],
                custom:       [],
                feedback:     "Test Feedback"
            },
            // "feedback":           "Test Feedback",
            postbackOnComplete: false,
            custom:             {},
            attachments:        [],
            state:              "SUCCESS"
        }
    };

    public static readonly outputRecordB: IAutoTestResult = {
        delivId:   TestData.inputRecordB.delivId,
        repoId:    TestData.inputRecordB.pushInfo.repoId,
        // "timestamp": TestData.inputRecordB.pushInfo.timestamp,
        commitURL: "https://github.ugrad.cs.ubc.ca/CPSC310-2017W-T2/d0_team999/commit/abe1b0918b872997de4c4d2baf4c263f8d4staff",
        commitSHA: "abe1b0918b872997de4c4d2baf4c263f8d4staff",
        input:     TestData.inputRecordA,
        output:    {
            timestamp:          1516523418918,
            report:             {
                scoreOverall: 50,
                scoreTest:    50,
                scoreCover:   50,
                passNames:    [],
                failNames:    [],
                errorNames:   [],
                skipNames:    [],
                custom:       [],
                feedback:     "Test Feedback"
            },
            // "feedback":           "Test Feedback",
            postbackOnComplete: false,
            custom:             {},
            attachments:        [],
            state:              "SUCCESS"
        }
    };
}
