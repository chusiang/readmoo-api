#! /usr/bin/env node
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
const inquirer = require("inquirer");
const BluebirdPromise = require("bluebird");
const index_1 = require("./index");
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
(() => __awaiter(this, void 0, void 0, function* () {
    const isLogin = yield index_1.checkLogin();
    if (!isLogin) {
        const { email } = yield inquirer.prompt({
            type: 'input',
            name: 'email',
            message: '請輸入您的 Email'
        });
        const { password } = yield inquirer.prompt({
            type: 'password',
            name: 'password',
            message: '以及您的密碼'
        });
        yield index_1.login(email, password);
    }
    const booksData = yield index_1.listBooks();
    const { books: selectedBooks } = yield inquirer.prompt({
        type: 'checkbox',
        name: 'books',
        message: '選擇要下載的書',
        choices: booksData.map(({ title, id }) => ({ name: title, value: { id, title }, short: title }))
    });
    const outputFiles = yield BluebirdPromise.mapSeries(selectedBooks, ({ id, title }) => __awaiter(this, void 0, void 0, function* () {
        try {
            const outputDir = yield index_1.downloadBook(id);
            const filename = yield index_1.generateEpub(title, outputDir);
            yield sleep(200);
            return filename;
        }
        catch (e) {
            console.error(`下載 "${title}" 失敗！`);
            console.error(e);
            return;
        }
    }));
    console.log('書籍已下載至：');
    console.log(outputFiles.filter(Boolean).map(f => '- ' + f).join('\n'));
}))();
//# sourceMappingURL=cli.js.map