import * as inquirer from 'inquirer'
import * as BluebirdPromise from 'bluebird';

import {
  checkLogin,
  downloadBook,
  generateEpub,
  listBooks,
  login
} from './index'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

;(async () => {
  const isLogin = await  checkLogin()
  if (!isLogin) {
    const { email } = await inquirer.prompt({
      type: 'input',
      name: 'email',
      message: '請輸入您的 Email'
    })

    const { password } = await inquirer.prompt({
      type: 'password',
      name: 'password',
      message: '以及您的密碼'
    })

    await login(email, password)
  }

  const booksData = await listBooks()
  // const booksData = (await listBooks()).filter(b => b.id !== '210100035000101')
  const { books: selectedBooks } = await inquirer.prompt({
    type: 'checkbox',
    name: 'books',
    message: '選擇要下載的書',
    choices: booksData.map(({ title, id }) => ({ name: title, value: { id, title }, short: title }))
  })

  const outputFiles = await BluebirdPromise.mapSeries(selectedBooks, async ({ id, title }) => {
    try {
      const outputDir = await downloadBook(id)
      const filename = await generateEpub(title, outputDir)
      await sleep(200)
      return filename
    } catch (e) {
      console.error(`下載 "${title}" 失敗！`)
      return
    }
  })

  console.log('書籍已下載至：')
  console.log(outputFiles.filter(Boolean).map(f => '- ' + f).join('\n'))
})()
