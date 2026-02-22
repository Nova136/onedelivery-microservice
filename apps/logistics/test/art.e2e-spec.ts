import {
  BuddyNominationEntity,
  GLCodeTypeEntity,
  GLCodeValueEntity,
  GLCodeValueTranslateEntity
} from '@apps/common/src/database/entities';
import { SwabTestResultEntity } from '@apps/medical/src/database/entities';
import { UserEntity } from '@apps/user/src/database/entities';
import { artApp, commonApp, dbInitialBackup, medicalApp, owner, userApp } from '@libs/utils/tests/e2e-setup';
import { ResponseStatus } from '../src/core/dtos/response-obj.dto';
import { ARTSubmission } from '../src/database/entities/art-submission.entity';
const request = require('supertest');
const moment = require('moment');

describe('ART service (e2e)', () => {
  beforeAll(() => {
    dbInitialBackup.restore();
  });
  let ownerOldIdNumber;

  beforeEach(async () => {
    const userRepo = userApp.dataSource.getRepository(UserEntity);
    const currentOwner = await userRepo.findOne({
      where: {
        Id: owner,
      }
    });

    ownerOldIdNumber = currentOwner.IdNumber;
  });

  it('[FWM-209] - it should execute "/insertartsubmission" - Expected art submission data to be inserted to database', async () => {
    const repository = artApp.dataSource.getRepository(ARTSubmission);

    const response = await request(artApp.app.getHttpServer())
      .post('/insertartsubmission')
      .send({
        UserId: owner,
        Result: 'Negative',
        IsSupervised: false,
        Brand: 'BD VERITOR',
        Location: 'Recreation Centre',
        SupervisorID: 'G1530447U',
      })
      .expect(200);
    const insertedData = await repository.find();
    expect(response.body.data).toEqual(expect.objectContaining({ Status: true }));
    expect(insertedData[0].Id).toEqual(1);
    expect(insertedData[0].Result).toEqual('Negative');
    expect(insertedData[0].Brand).toEqual('BD VERITOR');
    expect(insertedData[0].CreatedBy).toEqual(owner);
  });

  it('preload mock data', async () => {
    const userIds = ['4eed09dc-8267-11ed-a1eb-0242ac120002', '57a4595e-8267-11ed-a1eb-0242ac120002', owner];
    //Mock data values
    const codevalueItem = commonApp.dataSource.getRepository(GLCodeValueEntity);
    const codetypeItem = commonApp.dataSource.getRepository(GLCodeTypeEntity);
    const codevaluetranslate = commonApp.dataSource.getRepository(GLCodeValueTranslateEntity);
    const addUserItem = userApp.dataSource.getRepository(UserEntity);
    const addBuddyNominationItem = commonApp.dataSource.getRepository(BuddyNominationEntity);
    const artRepo = artApp.dataSource.getRepository(ARTSubmission);
    const newCodeTypeItem17 = await codetypeItem.save({
      Id: 1,
      CreatedBy: owner,
      LastUpdatedBy: 'Admin',
      CodeType: '17',
      Description: 'test',
    } as GLCodeTypeEntity);
    await codetypeItem.update(newCodeTypeItem17.Id, { Id: 17 });
    const newCodeTypeItem18 = await codetypeItem.save({
      Id: 14,
      CreatedBy: owner,
      Lastupdateby: 'Admin',
      CodeType: '18',
      Description: 'test 2',
    } as GLCodeTypeEntity);
    await codetypeItem.update(newCodeTypeItem18.Id, { Id: 18 });
    await codevalueItem.save({
      Id: 1, //11001
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: owner,
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 17,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'PFIZER-BIONTECH COVID-19 Vaccine [Tozinameran] Injection',
      IsActive: 1,
    } as GLCodeValueEntity);
    await codevalueItem.save({
      Id: 2, //11003
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: owner,
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 18,
      CodeValue: 'বাঙালি',
      Description: 'বাঙালি',
      IsActive: 1,
    } as GLCodeValueEntity);
    await codevalueItem.save({
      Id: 3, //24001
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: owner,
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 17,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'COVID19VaccineBrand',
      IsActive: 1,
    } as GLCodeValueEntity);
    await codevaluetranslate.save({
      Id: 1, //1964
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: owner,
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeValueId: 3,
      LanguageId: 2,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'ফাইজার-বায়োএনটেক',
    } as GLCodeValueTranslateEntity);
    await codevaluetranslate.save({
      Id: 2, //1962
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: owner,
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeValueId: 3,
      LanguageId: 1,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'PFIZER-BIONTECH COVID-19 Vaccine [Tozinameran] Injection',
    } as GLCodeValueTranslateEntity);
    //User 1 to have 1 buddy
    //User 2 to have 2 buddies
    //User 3 is a fill buddy
    await addUserItem.save({
      Id: userIds[0],
      Name: 'user1',
      ContactNo: '90000001',
      IdNumber: 'F11111111',
      Email: 'testemailuser1@test.com',
      PhotoPath: null,
      SessionToken: null,
      LanguageId: 1,
      RecordStatus: 'A',
      Created: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      DateOfBirth: '1991-10-31 00:00:00',
      CountryCode: '65',
      UserType: 'FW',
      PassType: 'WP',
      ExpiryDate: '2021-06-03 00:00:00',
      CancellationDate: null,
      DepartedDate: null,
      TempToken: null,
      LastactiveDate: '2021-06-03 00:00:00',
      LastPageId: null,
      LastPageData: null,
    } as UserEntity);
    await addUserItem.save({
      Id: userIds[1],
      Name: 'user2',
      Contactno: 90000002,
      IdNumber: 'F22222222',
      Email: 'testemailuser2@test.com',
      PhotoPath: null,
      SessionToken: null,
      LanguageId: 1,
      RecordStatus: 'A',
      Created: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      DateOfBirth: '1991-10-31 00:00:00',
      CountryCode: '65',
      UserType: 'FW',
      PassType: 'WP',
      ExpiryDate: '2021-06-03 00:00:00',
      CancellationDate: null,
      DepartedDate: null,
      TempToken: null,
      LastActiveDate: '2021-06-03 00:00:00',
      LastPageId: null,
      LastPageData: null,
    } as UserEntity);
    await addUserItem.save({
      Id: userIds[2],
      Name: 'user3',
      ContactNo: '90000002',
      IdNumber: 'F33333333',
      Email: 'testemailuser3@test.com',
      PhotoPath: null,
      SessionToken: null,
      LanguageId: 1,
      RecordStatus: 'A',
      Created: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      DateOfBirth: '1991-10-31 00:00:00',
      CountryCode: '65',
      UserType: 'FW',
      PassType: 'WP',
      ExpiryDate: '2021-06-03 00:00:00',
      CancellationDate: null,
      DepartedDate: null,
      TempToken: null,
      LastActiveDate: '2021-06-03 00:00:00',
      LastPageId: null,
      LastPageData: null,
    } as UserEntity);
    //Buddy 1 nominates buddy 2
    await addBuddyNominationItem.save({
      Id: 1,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: owner,
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      UserId: userIds[0],
      BuddyId: userIds[1],
      BuddyCountryCode: '65',
      BuddyContactNo: '90000001',
    } as BuddyNominationEntity);
    //Buddy 2 nominates buddy 1
    await addBuddyNominationItem.save({
      Id: 2,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: owner,
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      UserId: userIds[1],
      BuddyId: userIds[0],
      BuddyCountryCode: '65',
      BuddyContactNo: '90000002',
    } as BuddyNominationEntity);
    //Buddy 3 nominates buddy 1
    await addBuddyNominationItem.save({
      Id: 3,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: owner,
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      UserId: userIds[0],
      BuddyId: userIds[2],
      BuddyCountryCode: '65',
      BuddyContactNo: '90000003',
    } as BuddyNominationEntity);
    await artRepo.save({
      Result: 'Negative',
      IsSupervised: false,
      Brand: "BD VERITOR",
      Location: "Recreation Centre",
      SupervisorID: "G1530447U",
      CreatedBy: owner,
      Created: moment().utc().subtract(9, 'days').toISOString(),
    } as ARTSubmission)
  });

  it('it should execute "/getartsubmissioninformation" - Expected art submission data to be returned', async () => {
    // const checkTableCode = artApp.db.public.many('SELECT * FROM art.art_submission');
    const response = await request(artApp.app.getHttpServer()).post('/getartsubmissioninformation').expect(200);

    expect(response.body.msg).toEqual(ResponseStatus.Success);
    expect(response.body.data.brandList[0].Value).toEqual('COVID19VaccineBrand');
    expect(response.body.data.locationList[0].Value).toEqual('বাঙালি');
  });

  it('[FWM-210] - it should execute "/getartsubmissionhistory" - Expected art submission history when user IdNumber not set', async () => {
    const userRepo = userApp.dataSource.getRepository(UserEntity);
    commonApp.db.public.none('TRUNCATE common.gl_code_type CASCADE');
    commonApp.db.public.none('TRUNCATE common.gl_code_value CASCADE');

    const codevalueItem = commonApp.dataSource.getRepository(GLCodeValueEntity);
    const codetypeItem = commonApp.dataSource.getRepository(GLCodeTypeEntity);
    const codevaluetranslate = commonApp.dataSource.getRepository(GLCodeValueTranslateEntity);
    const newCodeTypeItem1 = await codetypeItem.save({
      CreatedBy: 'Admin',
      Lastupdateby: 'Admin',
      CodeType: 'ARTBrand',
      Description: 'The brand for ART',
    } as GLCodeTypeEntity);
    await codetypeItem.update(newCodeTypeItem1.Id, { Id: 17 });

    const newCodeTypeItem2 = await codetypeItem.save({
      CreatedBy: 'Admin',
      Lastupdateby: 'Admin',
      CodeType: 'ARTLocation',
      Description: 'The brand for ART',
    } as GLCodeTypeEntity);
    await codetypeItem.update(newCodeTypeItem2.Id, { Id: 18 });

    // const checkTableFindValidation = `SELECT * FROM common.gl_code_type`;
    // console.table(commonApp.db.public.many(checkTableFindValidation));

    const codeValue1 = await codevalueItem.save({
      Id: 1,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 17,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'COVID19VaccineBrand',
      IsActive: 1,
    } as GLCodeValueEntity);
    await codevalueItem.update(codeValue1.Id, { Id: 1 });

    const codeValue2 = await codevalueItem.save({
      Id: 2,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 18,
      CodeValue: 'COVID19VaccineLocal',
      Description: 'COVID19VaccineLocal',
      IsActive: 1,
    } as GLCodeValueEntity);
    await codevalueItem.update(codeValue2.Id, { Id: 2 });

    await codevaluetranslate.save({
      Id: 1, //1962
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeValueId: 1,
      LanguageId: 1,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'PFIZER-BIONTECH COVID-19 Vaccine [Tozinameran] Injection',
    } as GLCodeValueTranslateEntity);

    const currentOwner = await userRepo.findOne({
      where: {
        Id: owner,
      }
    });

    const oldIdNumber = currentOwner.IdNumber;
    await userRepo.update(owner, {
      IdNumber: null,
    });

    const response = await request(artApp.app.getHttpServer()).post('/getartsubmissionhistory').expect(200);

    await userRepo.update(owner, {
      IdNumber: oldIdNumber,
    });

    expect(response.body.msg).toEqual(ResponseStatus.Success);
    expect(response.body.data.brandList[0].Value).toEqual("COVID19VaccineBrand");
    expect(response.body.data.locationList[0].Value).toEqual("COVID19VaccineLocal");
  });

  it('[FWM-210] - it should execute "/getartsubmissionhistory" - Expected art submission history when user IdNumber has set', async () => {
    const userRepo = userApp.dataSource.getRepository(UserEntity);
    commonApp.db.public.none('TRUNCATE common.gl_code_type CASCADE');
    commonApp.db.public.none('TRUNCATE common.gl_code_value CASCADE');

    const codevalueItem = commonApp.dataSource.getRepository(GLCodeValueEntity);
    const codetypeItem = commonApp.dataSource.getRepository(GLCodeTypeEntity);
    const codevaluetranslate = commonApp.dataSource.getRepository(GLCodeValueTranslateEntity);
    const newCodeTypeItem1 = await codetypeItem.save({
      CreatedBy: 'Admin',
      Lastupdateby: 'Admin',
      CodeType: 'ARTBrand',
      Description: 'The brand for ART',
    } as GLCodeTypeEntity);
    await codetypeItem.update(newCodeTypeItem1.Id, { Id: 17 });

    const newCodeTypeItem2 = await codetypeItem.save({
      CreatedBy: 'Admin',
      Lastupdateby: 'Admin',
      CodeType: 'ARTLocation',
      Description: 'The brand for ART',
    } as GLCodeTypeEntity);
    await codetypeItem.update(newCodeTypeItem2.Id, { Id: 18 });

    const codeValue1 = await codevalueItem.save({
      Id: 1,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 17,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'COVID19VaccineBrand',
      IsActive: 1,
    } as GLCodeValueEntity);
    await codevalueItem.update(codeValue1.Id, { Id: 1 });

    const codeValue2 = await codevalueItem.save({
      Id: 2,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 18,
      CodeValue: 'COVID19VaccineLocal',
      Description: 'COVID19VaccineLocal',
      IsActive: 1,
    } as GLCodeValueEntity);
    await codevalueItem.update(codeValue2.Id, { Id: 2 });

    const checkTableFindValidation = `SELECT * FROM common.gl_code_value`;

    await codevaluetranslate.save({
      Id: 1, //1962
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeValueId: 1,
      LanguageId: 1,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'PFIZER-BIONTECH COVID-19 Vaccine [Tozinameran] Injection',
    } as GLCodeValueTranslateEntity);

    const response = await request(artApp.app.getHttpServer()).post('/getartsubmissionhistory').expect(200);

    expect(response.body.msg).toEqual(ResponseStatus.Success);
    expect(response.body.data.brandList[0].Value).toEqual("COVID19VaccineBrand");
    expect(response.body.data.locationList[0].Value).toEqual("COVID19VaccineLocal");
  });

  it('[FWM-210] - it should execute "/getartsubmissionhistory" - Expected art submission history with latest swab test result', async () => {
    const userRepo = userApp.dataSource.getRepository(UserEntity);
    commonApp.db.public.none('TRUNCATE common.gl_code_type CASCADE');
    commonApp.db.public.none('TRUNCATE common.gl_code_value CASCADE');

    const codevalueItem = commonApp.dataSource.getRepository(GLCodeValueEntity);
    const codetypeItem = commonApp.dataSource.getRepository(GLCodeTypeEntity);
    const codevaluetranslate = commonApp.dataSource.getRepository(GLCodeValueTranslateEntity);
    const swabTestRepo = medicalApp.dataSource.getRepository(SwabTestResultEntity);
    const artRepo = artApp.dataSource.getRepository(ARTSubmission);
    const currentOwner = await userRepo.findOne({
      where: {
        Id: owner,
      }
    });

    const newCodeTypeItem2 = await codetypeItem.save({
      CreatedBy: 'Admin',
      Lastupdateby: 'Admin',
      CodeType: 'ARTLocation',
      Description: 'The brand for ART',
    } as GLCodeTypeEntity);
    await codetypeItem.update(newCodeTypeItem2.Id, { Id: 18 });

    const codeValue28005 = await codevalueItem.save({
      Id: 2,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 18,
      CodeValue: 'COVID19VaccineLocal',
      Description: 'COVID19VaccineLocal',
      IsActive: 1,
      CodeValueId: 28005,
    } as GLCodeValueEntity);
    await codevalueItem.update(codeValue28005.Id, { Id: 28005 });

    await codevaluetranslate.save({
      Id: 1, //1962
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeValueId: 28005,
      LanguageId: 28005,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'PFIZER-BIONTECH COVID-19 Vaccine [Tozinameran] Injection',
    } as GLCodeValueTranslateEntity);

    const swabTestResult = await swabTestRepo.save({
      IdNumber: currentOwner.IdNumber.toUpperCase(),
      GeneratedTime: moment().utc().toISOString(),
      ArtCycleEndDate: moment().format('YYYY-MM-DD'),
      ArtSwabSource: 'not fwmomcare',
      Created: moment().utc().toISOString(),
      ArtLastSwabDate: moment().utc().add(1, 'days').format('YYYY-MM-DD'),
      ArtLastSwabResult: "ArtLastSwabResult",
      CreatedBy: owner,
    })

    const response = await request(artApp.app.getHttpServer()).post('/getartsubmissionhistory').expect(200);
    expect(response.body.msg).toEqual(ResponseStatus.Success);
    expect(response.body.data.historyList[0].Result).toEqual("ArtLastSwabResult");
    expect(response.body.data.isMissed).toEqual(false);
    expect(response.body.data.dormType).toEqual('-');
    expect(response.body.data.artAppointment).toEqual('-');
    expect(response.body.data.isExempted).toEqual('COVID19VaccineLocal');
  });


  it('[FWM-210] - it should execute "/getartsubmissionhistory" - Expected art submission history with latest skipCheckIsMissed false', async () => {
    commonApp.db.public.none('TRUNCATE common.gl_code_type CASCADE');
    commonApp.db.public.none('TRUNCATE common.gl_code_value CASCADE');

    const codevalueItem = commonApp.dataSource.getRepository(GLCodeValueEntity);
    const codetypeItem = commonApp.dataSource.getRepository(GLCodeTypeEntity);
    const codevaluetranslate = commonApp.dataSource.getRepository(GLCodeValueTranslateEntity);
    const swabTestRepo = medicalApp.dataSource.getRepository(SwabTestResultEntity);
    const userRepo = userApp.dataSource.getRepository(UserEntity);
    const currentOwner = await userRepo.findOne({
      where: {
        Id: owner,
      }
    });

    const newCodeTypeItem2 = await codetypeItem.save({
      CreatedBy: 'Admin',
      Lastupdateby: 'Admin',
      CodeType: 'ARTLocation',
      Description: 'The brand for ART',
    } as GLCodeTypeEntity);
    await codetypeItem.update(newCodeTypeItem2.Id, { Id: 18 });

    const codeValue28005 = await codevalueItem.save({
      Id: 2,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 18,
      CodeValue: 'COVID19VaccineLocal',
      Description: 'COVID19VaccineLocal',
      IsActive: 1,
      CodeValueId: 28005,
    } as GLCodeValueEntity);
    await codevalueItem.update(codeValue28005.Id, { Id: 28005 });

    await codevaluetranslate.save({
      Id: 1, //1962
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeValueId: 28005,
      LanguageId: 28005,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'PFIZER-BIONTECH COVID-19 Vaccine [Tozinameran] Injection',
    } as GLCodeValueTranslateEntity);

    const swabTestResult = await swabTestRepo.save({
      IdNumber: currentOwner.IdNumber.toUpperCase(),
      GeneratedTime: moment().utc().toISOString(),
      ArtCycleEndDate: moment().subtract(2, 'days').format('YYYY-MM-DD'),
      ArtSwabSource: 'fwmomcare',
      Created: moment().utc().subtract((+process.env.MAXARTSubmissionDateRange) + 1, 'days').toISOString(),
      ArtLastSwabDate: moment().utc().add(1, 'days').format('YYYY-MM-DD'),
      ArtLastSwabResult: "ArtLastSwabResult",
      IsRRTRequired: true,
      ArtSwabCycle: "artSwabCycle",
    })

    const response = await request(artApp.app.getHttpServer()).post('/getartsubmissionhistory').expect(200);

    expect(response.body.msg).toEqual(ResponseStatus.Success);
    expect(response.body.data.isMissed).toEqual(false);
    expect(response.body.data.dormType).toEqual('-');
    expect(response.body.data.artAppointment).toEqual(moment(swabTestResult.ArtCycleEndDate).format('DD-MM-YYYY'));
    expect(response.body.data.isExempted).toEqual('');
  });

  it('[FWM-210] - it should execute "/getartsubmissionhistory" - Expected art submission history with latest ResidencyType ND', async () => {
    commonApp.db.public.none('TRUNCATE common.gl_code_type CASCADE');
    commonApp.db.public.none('TRUNCATE common.gl_code_value CASCADE');

    const codevalueItem = commonApp.dataSource.getRepository(GLCodeValueEntity);
    const codetypeItem = commonApp.dataSource.getRepository(GLCodeTypeEntity);
    const codevaluetranslate = commonApp.dataSource.getRepository(GLCodeValueTranslateEntity);
    const swabTestRepo = medicalApp.dataSource.getRepository(SwabTestResultEntity);
    const artRepo = artApp.dataSource.getRepository(ARTSubmission);
    const userRepo = userApp.dataSource.getRepository(UserEntity);
    const currentOwner = await userRepo.findOne({
      where: {
        Id: owner,
      }
    });
    const newCodeTypeItem2 = await codetypeItem.save({
      CreatedBy: 'Admin',
      Lastupdateby: 'Admin',
      CodeType: 'ARTLocation',
      Description: 'The brand for ART',
    } as GLCodeTypeEntity);
    await codetypeItem.update(newCodeTypeItem2.Id, { Id: 18 });

    const codeValue28005 = await codevalueItem.save({
      Id: 2,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 18,
      CodeValue: 'COVID19VaccineLocal',
      Description: 'COVID19VaccineLocal',
      IsActive: 1,
      CodeValueId: 28005,
    } as GLCodeValueEntity);
    await codevalueItem.update(codeValue28005.Id, { Id: 28005 });

    await codevaluetranslate.save({
      Id: 1, //1962
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeValueId: 28005,
      LanguageId: 28005,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'PFIZER-BIONTECH COVID-19 Vaccine [Tozinameran] Injection',
    } as GLCodeValueTranslateEntity);

    const swabTestResult = await swabTestRepo.save({
      IdNumber: currentOwner.IdNumber.toUpperCase(),
      GeneratedTime: moment().utc().toISOString(),
      ArtCycleEndDate: moment().subtract(2, 'days').format('YYYY-MM-DD'),
      ArtSwabSource: 'fwmomcare',
      Created: moment().utc().subtract((+process.env.MAXARTSubmissionDateRange) + 1, 'days').toISOString(),
      ArtLastSwabDate: moment().utc().add(1, 'days').format('YYYY-MM-DD'),
      ArtLastSwabResult: "ArtLastSwabResult",
      IsRRTRequired: true,
      ArtSwabCycle: "artSwabCycle",
      ResidencyType: "ND",
    })

    const response = await request(artApp.app.getHttpServer()).post('/getartsubmissionhistory').expect(200);

    expect(response.body.msg).toEqual(ResponseStatus.Success);
    expect(response.body.data.isMissed).toEqual(false);
  });

  it('[FWM-210] - it should execute "/getartsubmissionhistory" - Expected art submission history with latest ResidencyType D', async () => {
    commonApp.db.public.none('TRUNCATE common.gl_code_type CASCADE');
    commonApp.db.public.none('TRUNCATE common.gl_code_value CASCADE');

    const codevalueItem = commonApp.dataSource.getRepository(GLCodeValueEntity);
    const codetypeItem = commonApp.dataSource.getRepository(GLCodeTypeEntity);
    const codevaluetranslate = commonApp.dataSource.getRepository(GLCodeValueTranslateEntity);
    const swabTestRepo = medicalApp.dataSource.getRepository(SwabTestResultEntity);
    const artRepo = artApp.dataSource.getRepository(ARTSubmission);
    const userRepo = userApp.dataSource.getRepository(UserEntity);
    const currentOwner = await userRepo.findOne({
      where: {
        Id: owner,
      }
    });
    const newCodeTypeItem2 = await codetypeItem.save({
      CreatedBy: 'Admin',
      Lastupdateby: 'Admin',
      CodeType: 'ARTLocation',
      Description: 'The brand for ART',
    } as GLCodeTypeEntity);
    await codetypeItem.update(newCodeTypeItem2.Id, { Id: 18 });

    const codeValue28005 = await codevalueItem.save({
      Id: 2,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 18,
      CodeValue: 'COVID19VaccineLocal',
      Description: 'COVID19VaccineLocal',
      IsActive: 1,
      CodeValueId: 28005,
    } as GLCodeValueEntity);
    await codevalueItem.update(codeValue28005.Id, { Id: 28005 });

    await codevaluetranslate.save({
      Id: 1, //1962
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeValueId: 28005,
      LanguageId: 28005,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'PFIZER-BIONTECH COVID-19 Vaccine [Tozinameran] Injection',
    } as GLCodeValueTranslateEntity);

    await swabTestRepo.save({
      IdNumber: currentOwner.IdNumber.toUpperCase(),
      GeneratedTime: moment().utc().toISOString(),
      ArtCycleEndDate: moment().subtract(2, 'days').format('YYYY-MM-DD'),
      ArtSwabSource: 'fwmomcare',
      Created: moment().utc().subtract((+process.env.MAXARTSubmissionDateRange) + 1, 'days').toISOString(),
      ArtLastSwabDate: moment().utc().add(1, 'days').format('YYYY-MM-DD'),
      ArtLastSwabResult: "ArtLastSwabResult",
      IsRRTRequired: true,
      ArtSwabCycle: "artSwabCycle",
      ResidencyType: "D",
    })

    const response = await request(artApp.app.getHttpServer()).post('/getartsubmissionhistory').expect(200);

    expect(response.body.msg).toEqual(ResponseStatus.Success);
    expect(response.body.data.isMissed).toEqual(false);
  });

  it('[FWM-210] - it should execute "/getartsubmissionhistory" - Expected art submission history with ArtCycleEndDate not set', async () => {
    commonApp.db.public.none('TRUNCATE common.gl_code_type CASCADE');
    commonApp.db.public.none('TRUNCATE common.gl_code_value CASCADE');

    const codevalueItem = commonApp.dataSource.getRepository(GLCodeValueEntity);
    const codetypeItem = commonApp.dataSource.getRepository(GLCodeTypeEntity);
    const codevaluetranslate = commonApp.dataSource.getRepository(GLCodeValueTranslateEntity);
    const swabTestRepo = medicalApp.dataSource.getRepository(SwabTestResultEntity);
    const artRepo = artApp.dataSource.getRepository(ARTSubmission);
    const userRepo = userApp.dataSource.getRepository(UserEntity);
    const currentOwner = await userRepo.findOne({
      where: {
        Id: owner,
      }
    });

    const newCodeTypeItem2 = await codetypeItem.save({
      CreatedBy: 'Admin',
      Lastupdateby: 'Admin',
      CodeType: 'ARTLocation',
      Description: 'The brand for ART',
    } as GLCodeTypeEntity);
    await codetypeItem.update(newCodeTypeItem2.Id, { Id: 18 });

    const codeValue28005 = await codevalueItem.save({
      Id: 2,
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeTypeId: 18,
      CodeValue: 'COVID19VaccineLocal',
      Description: 'COVID19VaccineLocal',
      IsActive: 1,
      CodeValueId: 28005,
    } as GLCodeValueEntity);
    await codevalueItem.update(codeValue28005.Id, { Id: 28005 });

    await codevaluetranslate.save({
      Id: 1, //1962
      Status: true,
      Archived: false,
      Created: new Date('2022-12-20T03:58:36.711Z'),
      CreatedBy: 'Admin',
      LastUpdated: new Date('2022-12-20T03:58:36.711Z'),
      LastUpdatedBy: 'Admin',
      CodeValueId: 28005,
      LanguageId: 28005,
      CodeValue: 'COVID19VaccineBrand',
      Description: 'PFIZER-BIONTECH COVID-19 Vaccine [Tozinameran] Injection',
    } as GLCodeValueTranslateEntity);

    const swabTestResult = await swabTestRepo.save({
      IdNumber: currentOwner.IdNumber.toUpperCase(),
      GeneratedTime: moment().utc().toISOString(),
      ArtSwabSource: 'fwmomcare',
      Created: moment().utc().subtract((+process.env.MAXARTSubmissionDateRange) + 1, 'days').toISOString(),
      ArtLastSwabDate: moment().utc().add(1, 'days').format('YYYY-MM-DD'),
      ArtLastSwabResult: "ArtLastSwabResult",
      IsRRTRequired: true,
      ArtSwabCycle: "artSwabCycle",
      ResidencyType: "others",
    })

    const response = await request(artApp.app.getHttpServer()).post('/getartsubmissionhistory').expect(200);

    expect(response.body.msg).toEqual(ResponseStatus.Success);
    expect(response.body.data.isMissed).toEqual(false);
    expect(response.body.data.artAppointment).toEqual('-');
  });

  afterEach(async () => {
    const userRepo = userApp.dataSource.getRepository(UserEntity);
    const currentOwner = await userRepo.findOne({
      where: {
        Id: owner,
      }
    });
    await userRepo.update(owner, {
      IdNumber: ownerOldIdNumber,
    });
  });
});
