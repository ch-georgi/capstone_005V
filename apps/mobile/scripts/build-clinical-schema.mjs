import {readFileSync,writeFileSync} from "node:fs";
const schema=readFileSync(new URL("../../../database/sqlite_mobile_schema.sql",import.meta.url),"utf8");
writeFileSync(new URL("../src/clinical/schema.ts",import.meta.url),"// Bundled authoritative schema v2; upgrade through migrateClinicalDatabase.\nexport const schema = "+JSON.stringify(schema)+";\n");
