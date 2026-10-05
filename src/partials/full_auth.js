import { queueBootstrapSlot } from '../js/bootstrap';

import { ensureApiLogin } from '../js/auth/cloudflare';

queueBootstrapSlot( () => {
  return ensureApiLogin();
}).then( (status) => {
  console.log('Login status',status);
});