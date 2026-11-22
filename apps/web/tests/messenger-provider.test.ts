import { describe,expect,test } from 'bun:test'
import { canManageMessengerPage } from '../src/lib/providers/messenger'
describe('Messenger Page permissions',()=>{
 test('requires messages and a management task',()=>{
  expect(canManageMessengerPage(['MESSAGING','MANAGE'])).toBe(true)
  expect(canManageMessengerPage(['MESSAGING'])).toBe(false)
  expect(canManageMessengerPage(['MODERATE'])).toBe(false)
  expect(canManageMessengerPage(['MESSAGING','CREATE_CONTENT'])).toBe(true)
 })
})
