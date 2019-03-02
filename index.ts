/**
 * 1. Login
 * 2. Use that cookies to get S3 guard cookies
 * 3. Books API
 * 4. ebpub downloader -> can be done independently
 */

require('dotenv').config()

import axios from 'axios'
import * as xmlConvert from 'xml-js'
import * as fs from 'fs-extra'
import * as path from 'path'

const requestOpt = {
  headers: {
    Cookie: `CloudFront-Key-Pair-Id=${process.env.CLOUDFRONT_KEY_PAIR_ID}; CloudFront-Policy=${process.env.CLOUDFRONT_POLICY}; CloudFront-Signature=${process.env.CLOUDFRONT_SIGNATURE}`
  }
}

const baseLink = 'https://reader.readmoo.com/ebook/45/102045/96082/1_0/full'

async function fetchContainer () {
  const { data } = await axios.get(`${baseLink}/META-INF/container.xml`, requestOpt)
  const containerObject: any = xmlConvert.xml2js(data, { compact: true, ignoreComment: true })
  const rootfile = containerObject.container.rootfiles.rootfile

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

fetchContainer()
fetchContent()
