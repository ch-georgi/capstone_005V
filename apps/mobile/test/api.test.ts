jest.mock("expo-file-system",()=>({File:class {async bytes(){return new Uint8Array([255,216,255,224,1,2,255,217]);}}}));
import { api } from "../src/auth/api";
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { apiUrl: "https://preview.example.com/api/v1/" } },
  },
}));
const mockFetch = jest.fn();
beforeEach(() => {
  globalThis.fetch = mockFetch;
});
it("uses the API URL embedded in the build configuration and preserves password spaces", async () => {
  mockFetch.mockResolvedValueOnce({
    status: 200,
    ok: true,
    json: async () => ({ status: "AUTHENTICATED" }),
  });
  await api.request("/auth/mobile/login", {
    email: "demo@example.com",
    password: " password ",
  });
  expect(mockFetch).toHaveBeenCalledWith(
    "https://preview.example.com/api/v1/auth/mobile/login",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        email: "demo@example.com",
        password: " password ",
      }),
    }),
  );
});
it("returns structured API errors without exposing raw responses", async () => {
  mockFetch.mockResolvedValueOnce({
    status: 401,
    ok: false,
    json: async () => ({
      code: "INVALID_CREDENTIALS",
      message: "Credenciales incorrectas.",
    }),
  });
  await expect(api.request("/auth/mobile/login", {})).rejects.toMatchObject({
    status: 401,
    code: "INVALID_CREDENTIALS",
  });
});
it("reports a network failure distinctly from an invalid session", async () => {
  mockFetch.mockRejectedValueOnce(new Error("offline"));
  await expect(api.request("/auth/me")).rejects.toMatchObject({
    status: 0,
    code: "NETWORK_ERROR",
  });
});
it("handles no-content responses without trying to parse JSON", async () => {
  const json = jest.fn();
  mockFetch.mockResolvedValueOnce({ status: 204, ok: true, json });
  await expect(
    api.request("/auth/logout", { refreshToken: "synthetic" }),
  ).resolves.toBeUndefined();
  expect(json).not.toHaveBeenCalled();
});

describe("Expo 57 multipart transport",()=>{
  const {installFormDataPatch}=jest.requireActual("../node_modules/expo/src/winter/FormData");
  const NativeFormData=jest.requireActual("react-native/Libraries/Network/FormData").default;
  const originalFormData=globalThis.FormData;
  const {convertFormDataAsync}=jest.requireActual("../node_modules/expo/src/winter/fetch/convertFormData");
  beforeAll(()=>{globalThis.FormData=installFormDataPatch(NativeFormData) as typeof FormData;});
  afterAll(()=>{globalThis.FormData=originalFormData;});
  it("sends actual JPG bytes, explicit MIME/name and unchanged request through Expo's real serializer",async()=>{
    const envelope={operationId:"pending-operation",filename:"foto.jpg",mimeType:"image/jpeg"};
    let wire:Uint8Array|undefined;
    mockFetch.mockImplementationOnce(async(_url,options)=>{
      wire=(await convertFormDataAsync(options.body,"test-boundary")).body;
      return {status:201,ok:true,json:async()=>({examId:"exam",versionId:"version",replayed:false})};
    });
    await expect(api.upload!(envelope,"file:///private/pending/uuid-without-extension","foto.jpg","image/jpeg","token")).resolves.toMatchObject({examId:"exam"});
    const text=Array.from(wire!).map(v=>String.fromCharCode(v)).join("");
    expect(text).toContain('name="file"; filename="foto.jpg"');
    expect(text).toContain('content-type: image/jpeg');
    expect(text).toContain(JSON.stringify(envelope));
    expect(text).toContain(String.fromCharCode(255,216,255,224,1,2,255,217));
    expect(mockFetch).toHaveBeenCalledWith("https://preview.example.com/api/v1/exams/uploads",expect.objectContaining({headers:{Authorization:"Bearer token",Accept:"application/json"}}));
  });
  it("reproduces the rejected URI-only representation from the previous APK",async()=>{
    const legacy=new FormData();legacy.append("file",{uri:"file:///pending",name:"foto.jpg",type:"image/jpeg"} as unknown as Blob);
    await expect(convertFormDataAsync(legacy)).rejects.toThrow("Unsupported FormDataPart implementation");
  });
  it("preserves server validation errors rather than classifying them as network errors",async()=>{
    mockFetch.mockResolvedValueOnce({status:415,ok:false,json:async()=>({code:"UNSUPPORTED_FILE_TYPE",message:"Formato no permitido"})});
    await expect(api.upload!({},"file:///pending","foto.jpg","image/jpeg","token")).rejects.toMatchObject({status:415,code:"UNSUPPORTED_FILE_TYPE"});
  });
});
