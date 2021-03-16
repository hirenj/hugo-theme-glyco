import { queueBootstrapSlot } from '../js/bootstrap';

import { parseLogin } from '../js/auth/azuread';


queueBootstrapSlot( () => {
  return parseLogin();
});