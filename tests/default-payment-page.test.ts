import {describe,it,expect} from 'vitest';
import {defaultPaymentPage} from '../server/defaultPaymentPage';
const url='https://courseaccess.minty-12-shar.workers.dev/checkout';
describe('dedicated Paddle payment-link landing page',()=>{
 it('loads the live SDK only on the approved origin with a valid public token',async()=>{
  const r=defaultPaymentPage(new Request(url),'live_testfixture');
  expect(r.status).toBe(200);
  const body=await r.text();
  expect(body).toContain('https://cdn.paddle.com/paddle/v2/paddle.js');
  expect(body).toContain('Paddle.Initialize');
  expect(body).not.toContain('Paddle.Checkout.open');
  expect(body).not.toContain('pdl_live_apikey');
  expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
 });
 it('fails closed outside the approved production origin',async()=>{
  for(const r of [defaultPaymentPage(new Request(url)),defaultPaymentPage(new Request(url),'test_fixture'),defaultPaymentPage(new Request('https://example.invalid/checkout'),'live_fixture')]){
   expect(r.status).toBe(503);expect(await r.text()).not.toContain('Paddle.Initialize');
  }
 });
 it('does not reflect a supplied transaction id into HTML',async()=>{
  const r=defaultPaymentPage(new Request(url+'?_ptxn=%3Cscript%3E'),'live_fixture');
  expect(await r.text()).not.toContain('<script>');
 });
});
