/**
 * 1. Login
 * 2. Use that cookies to get S3 guard cookies
 * 3. Books API
 * 4. ebpub downloader -> can be done independently
 */

require('dotenv').config()

import * as fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import * as childProcess from 'child_process'

import axios, { AxiosResponse } from 'axios'
import * as xmlConvert from 'xml-js'
import * as queryString from 'querystring'
import * as tempy from 'tempy'
import * as archiver from 'archiver'
import * as downloadDir from 'downloads-folder'

const CREDENTIAL_PATH = path.join(os.homedir(), '.readmoo-api', 'credentials.json')
fs.ensureFileSync(CREDENTIAL_PATH)

class ReadmooAPIError extends TypeError {}
class LoginError extends ReadmooAPIError {}

interface ICredential {
  readmoo: string,
  cloudFrontKeyPairId: string
  cloudFrontPolicy: string
  cloudFrontSignature: string
}


const cookieRegex = (str) => new RegExp(`${str}=[^;]+;`)

const KEY_PAIR_ID_REGEX = cookieRegex('CloudFront-Key-Pair-Id')
const POLICY_REGEX = cookieRegex('CloudFront-Policy')
const SINATURE_REGEX = cookieRegex('CloudFront-Signature')

class Credential {
  private credential: ICredential

  constructor () {
    this.credential = this.load()
  }

  get readmoo () {
    return this.credential.readmoo
  }

  set readmoo (value: string) {
    this.credential.readmoo = value
  }

  get cloudFrontKeyPairId () {
    return this.credential.cloudFrontKeyPairId
  }

  set cloudFrontKeyPairId (value: string) {
    this.credential.cloudFrontKeyPairId  = value
  }

  get cloudFrontPolicy () {
    return this.credential.cloudFrontPolicy
  }

  set cloudFrontPolicy (value: string) {
    this.credential.cloudFrontPolicy  = value
  }

  get cloudFrontSignature () {
    return this.credential.cloudFrontSignature
  }

  set cloudFrontSignature (value: string) {
    this.credential.cloudFrontSignature  = value
  }

  public save () {
    fs.writeFileSync(CREDENTIAL_PATH, JSON.stringify(this.credential, null, 2))
  }

  private setAWSCredential (cookie: string) {
    let m

    m = cookie.match(KEY_PAIR_ID_REGEX)
    if (m && m[0]) {
      this.cloudFrontKeyPairId = m[0]
    }

    m = cookie.match(POLICY_REGEX)
    if (m && m[0]) {
      this.cloudFrontPolicy = m[0]
    }

    m = cookie.match(SINATURE_REGEX)
    if (m && m[0]) {
      this.cloudFrontSignature = m[0]
    }
  }

  public saveCredentials (res: AxiosResponse) {
    const cookies = res.headers['set-cookie'] || []
    cookies.map(this.setAWSCredential.bind(this))
    this.save()
  }

  public getHeaders () {
    const cookies = [
      this.readmoo,
      this.cloudFrontKeyPairId,
      this.cloudFrontPolicy,
      this.cloudFrontSignature
    ]

    return {
      Cookie: cookies.filter(Boolean).join(' ')
    }
  }

  private load () {
    try {
      return JSON.parse(fs.readFileSync(CREDENTIAL_PATH, 'utf-8'))
    } catch (err) {
      return {}
    }
  }
}

export const credential = new Credential()

export async function login (email: string, password: string) {
  const result = childProcess.spawnSync('curl', [
    '-X',
    'POST',
    'https://member.readmoo.com/login',
    '-H',
    'Content-Type: application/x-www-form-urlencoded',
    '-d',
    queryString.stringify({ email, password }),
    '-c',
    '-'
  ])

  const match = result.stdout.toString().match(/readmoo\t(.+)/)
  if (match && match[1]) {
    credential.readmoo = `readmoo=${match[1]};`
    credential.save()
  } else {
    throw new LoginError()
  }
}

export async function checkLogin () {
  try {
    const res = await axios.get('https://new-read.readmoo.com/api/me/readings', {
      headers: credential.getHeaders()
    })
    if (res.data.status === 'error_login') {
      return false
    } else {
      return true
    }
  } catch (error) {
    return false
  }
}

export async function listBooks () {
  const { data: readingData } = await axios.get('https://new-read.readmoo.com/api/me/readings', {
    headers: credential.getHeaders()
  })

  const bookData = readingData.data[0]
  const readerAPI = bookData.links.reader.match(/[^\?]+/)[0]
  const res = await axios.get(`${readerAPI}`, {
    headers: credential.getHeaders()
  })

  return readingData.included

  // const bookId = bookData.relationships.data.find(c => c.type === 'book').id
  // const book = readingData.included.find(include => include.id === bookId)
  // console.log(book)
}

// TODO: typed parameter
export async function downloadBook (bookId: string) {
  const response = await axios.get(`https://reader.readmoo.com/api/book/${bookId}/nav`, {
    headers: credential.getHeaders()
  })
  const { data: bookData } = response
  const { base, nav_dir, opf } = bookData
  credential.saveCredentials(response)

  const baseUrl = `https://reader.readmoo.com${base}`
  const navLink = `https://reader.readmoo.com${nav_dir}`
  const opfUrl = `${navLink}${opf}`

  // start download all the data
  const tmpBookDir = tempy.directory()

  await downloadEpubContainer(baseUrl, tmpBookDir)
  const bookMeta = await downloadEpubContent(opfUrl, opf, tmpBookDir)
  await downloadEpubAssets(bookMeta, navLink, tmpBookDir)

  return tmpBookDir
}

async function downloadEpubContainer (baseUrl: string, tmpBookDir: string) {
  const containerFileName = 'META-INF/container.xml'
  const { data } = await axios.get(`${baseUrl}${containerFileName}`, {
    headers: credential.getHeaders()
  })

  const fn = path.join(tmpBookDir, containerFileName)
  fs.ensureFileSync(fn)
  fs.writeFileSync(fn, data)
}

async function downloadEpubContent (opfUrl: string, opfPath: string, tmpBookDir: string) {
  const { data } = await axios.get(opfUrl, {
    headers: credential.getHeaders()
  })
  // write content
  const fn = path.join(tmpBookDir, 'OEBPS', opfPath)
  fs.ensureFileSync(fn)
  fs.writeFileSync(fn, data)

  const contentObject: any = xmlConvert.xml2js(data, { compact: true, ignoreComment: true })
  return contentObject
}

// TODO: typed parameter
async function downloadEpubAssets (bookMeta: any, navLink: string, tmpBookDir: string) {
  const files = bookMeta.package.manifest.item.map(it => it._attributes['href'])
    .map(href => ({
      link: `${navLink}${href}`,
      base: href
    }))
  await Promise.all(files.map(async ({ link, base }) => {
    const isImage = base.includes('jpg')
    const responseOpt = isImage ? { responseType: 'stream' } : {}
    const { data } = await axios.get(link, { headers: credential.getHeaders() , ...responseOpt})
    const filename = path.join(tmpBookDir, 'OEBPS', base)
    fs.ensureFileSync(filename)
    if (isImage) {
      data.pipe(fs.createWriteStream(filename))
    } else {
      fs.writeFileSync(filename, data)
    }
  }))
}

export async function generateEpub (title: string, dir: string, outputFolder: string = downloadDir()): Promise<string> {
  return new Promise((resolve, reject) => {

    const outputFile = path.join(outputFolder, `${title}.epub`)
    // create a file to stream archive data to.
    var output = fs.createWriteStream(outputFile)
    var archive = archiver('zip', {
      zlib: { level: 0 }
    })

    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        // log warning
      } else {
        // throw error
        reject(err)
      }
    })

    archive.on('error', function (err) {
      reject(err)
    })

    archive.pipe(output)
    archive.directory(dir, false)
    archive.finalize()
    return resolve(outputFile)
  })
}
