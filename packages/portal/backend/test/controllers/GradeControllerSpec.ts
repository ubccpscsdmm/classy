import {expect} from "chai";
import "mocha";

import {Test} from "../GlobalSpec";

import {GradesController} from "../../src/controllers/GradesController";
import {GradePayload} from "../../../../common/types/SDMMTypes";
import {AutoTestGradeTransport} from "../../../../common/types/PortalTypes";
import {DeliverablesController} from "../../src/controllers/DeliverablesController";

const loadFirst = require('../GlobalSpec');
const rFirst = require('./RepositoryControllerSpec');

describe("GradeController", () => {

    let gc: GradesController;

    before(async () => {
    });

    beforeEach(() => {
        gc = new GradesController();
    });

    it("Should be able to get all grades, even if there are none.", async () => {
        let grades = await gc.getAllGrades();
        expect(grades).to.have.lengthOf(0);
    });

    it("Should be able to create a grade.", async () => {
        let grades = await gc.getAllGrades();
        expect(grades).to.have.lengthOf(0);

        let grade: GradePayload = {
            score:     100,
            comment:   'comment',
            urlName:   'urlName',
            URL:       'URL',
            timestamp: Date.now(),
            custom:    {}
        };

        let valid = await gc.createGrade(Test.REPONAME1, Test.DELIVID1, grade);
        expect(valid).to.be.true;
        grades = await gc.getAllGrades();
        expect(grades).to.have.lengthOf(2);
        expect(grades[0].score).to.equal(100);
    });

    it("Should be able to update a grade.", async () => {
        let grades = await gc.getAllGrades();
        expect(grades).to.have.lengthOf(2); // from previous

        let grade: GradePayload = {
            score:     50,
            comment:   'commentup',
            urlName:   'urlName',
            URL:       'URLup',
            timestamp: Date.now(),
            custom:    {}
        };

        let valid = await gc.createGrade(Test.REPONAME1, Test.DELIVID1, grade);
        expect(valid).to.be.true;
        grades = await gc.getAllGrades();
        expect(grades).to.have.lengthOf(2); // still two (one for each teammember)
        expect(grades[0].score).to.equal(50);
        expect(grades[0].comment).to.equal('commentup');
        expect(grades[0].URL).to.equal('URLup');
    });

    it("Should be able to get a grade for a user and deliverable.", async () => {
        let grades = await gc.getAllGrades();
        expect(grades).to.have.lengthOf(2); // from previous

        let grade = await gc.getGrade(Test.USERNAME1, Test.DELIVID1);
        expect(grade).to.not.be.null;
        expect(grade.score).to.equal(50);
    });

    it("Should be able to get all released grades for a user.", async () => {
        let grades = await gc.getAllGrades();
        expect(grades).to.have.lengthOf(2); // from previous

        // close deliv
        const dc = new DeliverablesController();
        let deliv = await dc.getDeliverable(Test.DELIVID1);
        deliv.gradesReleased = false;
        await dc.saveDeliverable(deliv);

        grades = await gc.getReleasedGradesForPerson(Test.USERNAME1);
        expect(grades.length).to.equal(0); // no deliverables have grades released

        deliv = await dc.getDeliverable(Test.DELIVID1);
        deliv.gradesReleased = true;
        await dc.saveDeliverable(deliv);

        grades = await gc.getReleasedGradesForPerson(Test.USERNAME1);
        expect(grades.length).to.equal(1); // no deliverables have grades released
        expect(grades[0].score).to.equal(50);

        // check with a released deliverable that has no grade record
        deliv = Test.getDeliverable(Test.DELIVID2);
        deliv.gradesReleased = true;
        await dc.saveDeliverable(deliv);
        grades = await gc.getReleasedGradesForPerson(Test.USERNAME1);
        expect(grades.length).to.equal(2); // no deliverables have grades released
        expect(grades[0].delivId).to.equal(Test.DELIVID1);
        expect(grades[0].score).to.equal(50);
        expect(grades[1].delivId).to.equal(Test.DELIVID2);
        expect(grades[1].score).to.equal(null);
    });


    it("Should be able to invalidate bad grades.", async () => {
        let deliv = await gc.validateAutoTestGrade(undefined);
        expect(deliv).to.not.be.null;
        expect(deliv).to.be.an('string');

        deliv = await gc.validateAutoTestGrade(null);
        expect(deliv).to.not.be.null;
        expect(deliv).to.be.an('string');

        let data: AutoTestGradeTransport = <AutoTestGradeTransport>{};
        deliv = await gc.validateAutoTestGrade(data);
        expect(deliv).to.not.be.null;
        expect(deliv).to.be.an('string');

        data = <AutoTestGradeTransport>{delivId: 'd0'};
        deliv = await gc.validateAutoTestGrade(data);
        expect(deliv).to.not.be.null;
        expect(deliv).to.be.an('string');

        data = <AutoTestGradeTransport>{delivId: 'd0', score: 100};
        deliv = await gc.validateAutoTestGrade(data);
        expect(deliv).to.not.be.null;
        expect(deliv).to.be.an('string');

        data = <AutoTestGradeTransport>{delivId: 'd0', score: 100, comment: 'comment'};
        deliv = await gc.validateAutoTestGrade(data);
        expect(deliv).to.not.be.null;
        expect(deliv).to.be.an('string');

        data = <AutoTestGradeTransport>{delivId: 'd0', score: 100, comment: 'comment', urlName: 'urlName'};
        deliv = await gc.validateAutoTestGrade(data);
        expect(deliv).to.not.be.null;
        expect(deliv).to.be.an('string');

        data = <AutoTestGradeTransport>{delivId: 'd0', score: 100, comment: 'comment', urlName: 'urlName', URL: 'http://url'};
        deliv = await gc.validateAutoTestGrade(data);
        expect(deliv).to.not.be.null;
        expect(deliv).to.be.an('string');

        data = <AutoTestGradeTransport>{
            delivId:   'd0',
            score:     100,
            comment:   'comment',
            urlName:   'urlName',
            URL:       'http://url',
            timestamp: Date.now()
        };
        deliv = await gc.validateAutoTestGrade(data);
        expect(deliv).to.not.be.null;
        expect(deliv).to.be.an('string');

        data = <AutoTestGradeTransport>{
            delivId:   'd0',
            score:     100,
            comment:   'comment',
            urlName:   'urlName',
            URL:       'http://url',
            timestamp: Date.now(),
            custom:    {}
        };
        deliv = await gc.validateAutoTestGrade(data);
        expect(deliv).to.be.null;
    });

});
