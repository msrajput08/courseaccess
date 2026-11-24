import {describe,it,expect,vi} from 'vitest';
import {retryPaddleInbox} from '../server/billingApi';
import type {Database} from '../server/accountSecurity';
describe('durable webhook retry gate',()=>{
 it('does not query D1 or Paddle unless both release flags and API key are present',async()=>{
  const prepare=vi.fn();
  const DB={prepare} as unknown as Database;
  await retryPaddleInbox({DB});
  await retryPaddleInbox({DB,COURSEACCESS_PADDLE_RECONCILE_ENABLED:'true'});
  await retryPaddleInbox({DB,COURSEACCESS_LIVE_WEBHOOK_INBOX_ENABLED:'true',COURSEACCESS_PADDLE_RECONCILE_ENABLED:'true'});
  expect(prepare).not.toHaveBeenCalled();
 });
});
