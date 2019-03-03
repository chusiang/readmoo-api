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

import axios from 'axios'
import * as xmlConvert from 'xml-js'
import * as queryString from 'querystring'

const requestOpt = {
  headers: {
    Cookie: `CloudFront-Key-Pair-Id=${process.env.CLOUDFRONT_KEY_PAIR_ID}; CloudFront-Policy=${process.env.CLOUDFRONT_POLICY}; CloudFront-Signature=${process.env.CLOUDFRONT_SIGNATURE}`
  }
}

const CREDENTIAL_PATH = path.join(os.homedir(), '.readmoo-cli', 'credentials.json')
fs.ensureFileSync(CREDENTIAL_PATH)

class ReadmooAPIError extends TypeError {}
class LoginError extends ReadmooAPIError {}

interface ICredential {
  readmoo: string,
  cloudFrontKeyPairId: string
  cloudFrontPolicy: string
  cloudFrontSignature: string
}

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

  private load () {
    try {
      return JSON.parse(fs.readFileSync(CREDENTIAL_PATH, 'utf-8'))
    } catch (err) {
      return {}
    }
  }
}

const credential = new Credential()

async function login (email: string, password: string) {
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

const baseLink = 'https://reader.readmoo.com/ebook/45/102045/96082/1_0/full'

async function fetchContainer () {
  const { data } = await axios.get(`${baseLink}/META-INF/container.xml`, requestOpt)

  const filename = 'META-INF/container.xml'
  const fn = path.join(__dirname, './book/', filename)
  fs.ensureFileSync(fn)
  fs.writeFileSync(fn, data)
}


async function fetchContent () {
  const { data } = await axios.get(`${baseLink}/OEBPS/content.opf`, requestOpt)
  // write content
  const fn = path.join(__dirname, './book/', 'OEBPS/content.opf')
  fs.ensureFileSync(fn)
  fs.writeFileSync(fn, data)

  const contentObject: any = xmlConvert.xml2js(data, { compact: true, ignoreComment: true })
  const files = contentObject.package.manifest.item.map(it => it._attributes['href'])
    .map(href => ({
      link: `${baseLink}/OEBPS/${href}`,
      base: href
    }))
  await Promise.all(files.map(async ({ link, base }) => {
    const isImage = base.includes('jpg')
    const responseOpt = isImage ? { responseType: 'stream' } : {}
    const { data } = await axios.get(link, {...requestOpt, ...responseOpt})
    const filename = path.join(__dirname, './book/OEBPS/', base)
    fs.ensureFileSync(filename)
    if (isImage) {
      data.pipe(fs.createWriteStream(filename))
    } else {
      fs.writeFileSync(filename, data)
    }
  }))
}

// fetchContainer()
// fetchContent()

login(process.env.EMAIL, process.env.PASSWORD)
