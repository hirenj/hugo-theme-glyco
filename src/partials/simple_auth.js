import { ensureApiLogin } from '../js/auth/basic';

import { queueBootstrapSlot } from '../js/bootstrap';

queueBootstrapSlot( () => {
  return ensureApiLogin();
}).then( (status) => {
  console.log('Login status',status);
});