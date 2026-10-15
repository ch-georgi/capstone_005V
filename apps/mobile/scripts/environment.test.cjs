const { test } = require("node:test");
const assert = require("node:assert/strict");
const { productionApiUrl } = require("./environment.cjs");
test("producción acepta API HTTPS y normaliza barra final", () => {
  assert.equal(productionApiUrl("https://wellq-api.up.railway.app/api/v1/"), "https://wellq-api.up.railway.app/api/v1");
});
test("producción rechaza omisión, PostgreSQL, destinos locales y secretos en URL", () => {
  for (const value of [undefined, "", "postgresql://user:password@db:5432/railway", "http://api.up.railway.app/api/v1", "https://10.0.2.2/api/v1", "https://localhost/api/v1", "https://api.up.railway.app", "https://user:secret@api.up.railway.app/api/v1", "https://api.up.railway.app/api/v1?token=secret"]) {
    assert.throws(() => productionApiUrl(value));
  }
});
