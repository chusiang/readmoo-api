"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const axios_1 = require("axios");
const xmlConvert = require("xml-js");
const queryString = require("querystring");
const tempy = require("tempy");
const archiver = require("archiver");
const downloadDir = require("downloads-folder");
const CREDENTIAL_PATH = path.join(os.homedir(), '.readmoo-api', 'credentials.json');
fs.ensureFileSync(CREDENTIAL_PATH);
class ReadmooAPIError extends TypeError {
}
class LoginError extends ReadmooAPIError {
}
const cookieRegex = (str) => new RegExp(`${str}=[^;]+;`);
const KEY_PAIR_ID_REGEX = cookieRegex('CloudFront-Key-Pair-Id');
const POLICY_REGEX = cookieRegex('CloudFront-Policy');
const SINATURE_REGEX = cookieRegex('CloudFront-Signature');
class Credential {
    constructor() {
        this.credential = this.load();
    }
    get readmoo() {
        return this.credential.readmoo;
    }
    set readmoo(value) {
        this.credential.readmoo = value;
    }
    get cloudFrontKeyPairId() {
        return this.credential.cloudFrontKeyPairId;
    }
    set cloudFrontKeyPairId(value) {
        this.credential.cloudFrontKeyPairId = value;
    }
    get cloudFrontPolicy() {
        return this.credential.cloudFrontPolicy;
    }
    set cloudFrontPolicy(value) {
        this.credential.cloudFrontPolicy = value;
    }
    get cloudFrontSignature() {
        return this.credential.cloudFrontSignature;
    }
    set cloudFrontSignature(value) {
        this.credential.cloudFrontSignature = value;
    }
    save() {
        fs.writeFileSync(CREDENTIAL_PATH, JSON.stringify(this.credential, null, 2));
    }
    setAWSCredential(cookie) {
        let m;
        m = cookie.match(KEY_PAIR_ID_REGEX);
        if (m && m[0]) {
            this.cloudFrontKeyPairId = m[0];
        }
        m = cookie.match(POLICY_REGEX);
        if (m && m[0]) {
            this.cloudFrontPolicy = m[0];
        }
        m = cookie.match(SINATURE_REGEX);
        if (m && m[0]) {
            this.cloudFrontSignature = m[0];
        }
    }
    saveCredentials(res) {
        const cookies = res.headers['set-cookie'] || [];
        cookies.map(this.setAWSCredential.bind(this));
        this.save();
    }
    getHeaders() {
        const cookies = [
            this.readmoo,
            this.cloudFrontKeyPairId,
            this.cloudFrontPolicy,
            this.cloudFrontSignature
        ];
        return {
            Cookie: cookies.filter(Boolean).join(' ')
        };
    }
    load() {
        try {
            return JSON.parse(fs.readFileSync(CREDENTIAL_PATH, 'utf-8'));
        }
        catch (err) {
            return {};
        }
    }
}
exports.credential = new Credential();
function login(email, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const loginRes = yield axios_1.default.head('https://member.readmoo.com/login/');
        const cookies = loginRes.headers['set-cookie'] || [];
        const readmooCookie = cookies.find(c => c.match(/readmoo=([^;]+)/));
        const match = readmooCookie && readmooCookie.match(/readmoo=([^;]+)/);
        if (match && match[1]) {
            exports.credential.readmoo = `readmoo=${match[1]};`;
            exports.credential.save();
        }
        else {
            throw new LoginError();
        }
        const formData = queryString.stringify({ email, password });
        yield axios_1.default.post('https://member.readmoo.com/login/', formData, {
            headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, exports.credential.getHeaders())
        });
    });
}
exports.login = login;
function checkLogin() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield axios_1.default.get('https://new-read.readmoo.com/api/me/readings', {
                headers: exports.credential.getHeaders()
            });
            if (res.data.status === 'error_login') {
                return false;
            }
            else {
                return true;
            }
        }
        catch (error) {
            return false;
        }
    });
}
exports.checkLogin = checkLogin;
function listBooks() {
    return __awaiter(this, void 0, void 0, function* () {
        const { data: readingData } = yield axios_1.default.get('https://new-read.readmoo.com/api/me/readings', {
            headers: exports.credential.getHeaders()
        });
        const bookData = readingData.data[0];
        const readerAPI = bookData.links.reader.match(/[^\?]+/)[0];
        const res = yield axios_1.default.get(`${readerAPI}`, {
            headers: exports.credential.getHeaders()
        });
        return readingData.included;
    });
}
exports.listBooks = listBooks;
function downloadBook(bookId) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield axios_1.default.get(`https://reader.readmoo.com/api/book/${bookId}/nav`, {
            headers: exports.credential.getHeaders()
        });
        const { data: bookData } = response;
        const { base, nav_dir, opf } = bookData;
        exports.credential.saveCredentials(response);
        const baseUrl = `https://reader.readmoo.com${base}`;
        const navLink = `https://reader.readmoo.com${nav_dir}`;
        const opfUrl = `${navLink}${opf}`;
        const tmpBookDir = tempy.directory();
        yield downloadEpubContainer(baseUrl, tmpBookDir);
        const bookMeta = yield downloadEpubContent(opfUrl, opf, tmpBookDir);
        yield downloadEpubAssets(bookMeta, navLink, tmpBookDir);
        return tmpBookDir;
    });
}
exports.downloadBook = downloadBook;
function downloadEpubContainer(baseUrl, tmpBookDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const containerFileName = 'META-INF/container.xml';
        const { data } = yield axios_1.default.get(`${baseUrl}${containerFileName}`, {
            headers: exports.credential.getHeaders()
        });
        const fn = path.join(tmpBookDir, containerFileName);
        fs.ensureFileSync(fn);
        fs.writeFileSync(fn, data);
    });
}
function downloadEpubContent(opfUrl, opfPath, tmpBookDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const { data } = yield axios_1.default.get(opfUrl, {
            headers: exports.credential.getHeaders()
        });
        const fn = path.join(tmpBookDir, 'OEBPS', opfPath);
        fs.ensureFileSync(fn);
        fs.writeFileSync(fn, data);
        const contentObject = xmlConvert.xml2js(data, { compact: true, ignoreComment: true });
        return contentObject;
    });
}
function downloadEpubAssets(bookMeta, navLink, tmpBookDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const files = bookMeta.package.manifest.item.map(it => it._attributes['href'])
            .map(href => ({
            link: `${navLink}${href}`,
            base: href
        }));
        yield Promise.all(files.map(({ link, base }) => __awaiter(this, void 0, void 0, function* () {
            const isImage = base.includes('jpg');
            const responseOpt = isImage ? { responseType: 'stream' } : {};
            const { data } = yield axios_1.default.get(link, Object.assign({ headers: exports.credential.getHeaders() }, responseOpt));
            const filename = path.join(tmpBookDir, 'OEBPS', base);
            fs.ensureFileSync(filename);
            if (isImage) {
                data.pipe(fs.createWriteStream(filename));
            }
            else {
                fs.writeFileSync(filename, data);
            }
        })));
    });
}
function generateEpub(title, dir, outputFolder = downloadDir()) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            const outputFile = path.join(outputFolder, `${title}.epub`);
            var output = fs.createWriteStream(outputFile);
            var archive = archiver('zip', {
                zlib: { level: 0 }
            });
            archive.on('warning', function (err) {
                if (err.code === 'ENOENT') {
                }
                else {
                    reject(err);
                }
            });
            archive.on('error', function (err) {
                reject(err);
            });
            archive.pipe(output);
            archive.directory(dir, false);
            archive.finalize();
            return resolve(outputFile);
        });
    });
}
exports.generateEpub = generateEpub;
//# sourceMappingURL=index.js.map