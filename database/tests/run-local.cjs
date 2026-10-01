const path=require('node:path');
require('../../apps/api/node_modules/ts-node').register({project:path.resolve(__dirname,'../tsconfig.json')});
require('./local.test.ts');
