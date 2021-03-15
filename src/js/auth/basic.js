import MASCP from 'mascp-jstools';

// import { updateUserFieldToAnonymous } from './mixins/tryuser';
/*
MASCP.GatorDataReader.server = process.env.ROOT_API;

MASCP.GATOR_CLIENT_ID=process.env.CLIENT_ID;
*/

const TOKEN_KEY = 'idToken';

const parseJwt = (token) => {
  let base64Url = token.split('.')[1];
  if ( ! base64Url ) {
    return;
  }
  let base64 = base64Url.replace('-', '+').replace('_', '/');
  return JSON.parse(window.atob(base64));
};

const authorizedFetch = async (url) => {

  const base = await MASCP.GatorDataReader.authenticate();
  const auth = { base, token: MASCP.GATOR_AUTH_TOKEN, clientid: MASCP.GATOR_CLIENT_ID };

  const headers = {};
  headers['Authorization'] = 'Bearer '+auth.token;
  headers['x-api-key'] = auth.clientid;

  let target_url = url.replace(/^.*documents\//,`${base}/files?path=`);

  let api_resp = await fetch(new Request(target_url, {
    method: 'GET',
    headers,
  })).then( resp => resp.text() );

  if ( ! api_resp ) {
    return new Response(null, {
      status: 401,
      statusText: 'Unauthorized'
    });
  }

  return fetch(new Request(api_resp, {}));
};

MASCP.GatorDataReader.wrapAuthRetrieve(MASCP.UniprotReader);

const isCurrentToken = function(token) {
  MASCP.GatorDataReader.ID_TOKEN = token;
  return MASCP.GatorDataReader.authenticate().then( () => true ).catch( err => {
    if (err.message === 'unauthorized') {
      return false;
    }
    throw err;
  })
  .then( () => {
    let jwt = parseJwt(token);
    if ( ! jwt ) {
      return false;
    }
    let exp_time = new Date(jwt.exp*1000);
    let curr_time = new Date();
    if ( curr_time >= exp_time ) {
      console.log('ID token has expired',curr_time,exp_time);
      return false;
    }
    if ( curr_time.getTime() >= (exp_time.getTime() - 5*60*1000) ) {
      return 'expires_soon';
    }
    return true;
  })
  .then( (valid) => {
    if (! valid) {
      return false;
    }
    if (valid === 'expires_soon') {
      return true;
    }
    return true;
  }); // GatorDataReader can't test if token is current
};

const getUserId = () => {
  return localStorage.getItem('userName');
};

const getUserName = () => {
  let user_profile = JSON.parse(localStorage.getItem('profile'));
  return [ user_profile['http://glycocode/givenName'],user_profile['http://glycocode/familyName'] ];
};

const performLogout = () => {
  return Promise.resolve()
  .then( () => {
    loginStatusPromise = null;
    MASCP.GatorDataReader.ID_TOKEN = null;
    localStorage.setItem(TOKEN_KEY,null);
    localStorage.removeItem('userName');
  });
};

const getStoredToken = function() {
  return localStorage.getItem(TOKEN_KEY);
};

const setStoredToken = function(token) {
  return localStorage.setItem(TOKEN_KEY,token);
};

const ensureApiLogin = function() {
  return new Promise(resolve => {
    MASCP.GatorDataReader.anonymous = true;
  });
}

let loginStatusPromise = null;

const getLoginStatus = () => {
  if ( ! loginStatusPromise ) {
    loginStatusPromise = Promise.resolve()
    .then( () => ensureApiLogin() )
    .then( () => false );
  }
  return loginStatusPromise;
};



export { getLoginStatus, getUserId, getUserName, performLogout, authorizedFetch, ensureApiLogin, getStoredToken, TOKEN_KEY };