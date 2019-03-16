import { checkLogin, login } from '../src'
import { assert } from 'chai'

test('#login', async function () {
  await login(process.env.EMAIL, process.env.PASSWORD)

  assert.isTrue(await checkLogin())
})

