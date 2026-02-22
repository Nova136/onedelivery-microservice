export default async function setIdNextVal(dataSource, schemaName, tableName) {
  await dataSource.query(`SELECT setval('${schemaName}."${tableName}_id_seq"', (SELECT MAX(id) from ${schemaName}.${tableName}))`);
}