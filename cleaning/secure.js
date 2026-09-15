// cleaning/secure.js — 개인정보 암호화/해시
// 주소·연락처는 AES-256-GCM으로 암호화해 저장하고, 조회 키가 필요한 값(휴대폰/CI)은
// pepper를 섞은 SHA-256 해시로만 보관한다. CI 원본은 어디에도 저장하지 않는다.
const crypto = require("crypto");

const PEPPER = process.env.CLEANING_HASH_PEPPER || "dev-pepper-change-me";
const KEY = crypto.createHash("sha256")
  .update(process.env.CLEANING_ENC_KEY || "dev-enc-key-change-me").digest();

const hash = (v) => crypto.createHmac("sha256", PEPPER).update(String(v)).digest("hex");

function encrypt(plain) {
  if (plain == null || plain === "") return "";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}
function decrypt(blob) {
  if (!blob) return "";
  const [iv, tag, data] = String(blob).split(".");
  if (!iv || !tag || !data) return "";
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch { return ""; }
}
const maskPhone = (p) => String(p || "").replace(/^(\d{3})\d{3,4}(\d{4})$/, "$1****$2");
const token = () => crypto.randomBytes(24).toString("hex");

module.exports = { hash, encrypt, decrypt, maskPhone, token };
