import auth0 from 'auth0-js';

export { getUserId, getUserName, performLogout, authorizedFetch } from './basic';

import { getStoredToken, TOKEN_KEY } from './basic';

import MASCP from 'mascp-jstools';

MASCP.AUTH0_CLIENT_ID=MASCP.GATOR_CLIENT_ID;

MASCP.AUTH0_SCOPES='openid name email download:all_data';

const LOGIN_CONFIG_URL = `${MASCP.GatorDataReader.server}/api/login/config`;

const auth_object = fetch(LOGIN_CONFIG_URL).then(function(response) {
  return response.json();
}).then(function(config) {
  MASCP.AUTH0_AUDIENCE = config.API_AUDIENCE;
  MASCP.AUTH0_DOMAIN = config.AUTH0_DOMAIN + ".auth0.com";
  let webauth = new auth0.WebAuth({
    clientID: MASCP.AUTH0_CLIENT_ID,
    domain: MASCP.AUTH0_DOMAIN,
    audience: MASCP.AUTH0_AUDIENCE,
    scope: MASCP.AUTH0_SCOPES,
    redirectUri: window.location.origin +"/loggedin",
    popupOrigin: window.location.origin,
    responseType: 'token id_token'
  });
  return webauth;
});

const tryRenewingToken = function(token) {
  return auth_object.then( webauth => {
    return new Promise( (resolve,reject) => {
      console.log('Checking session state');
      webauth.checkSession({scope: MASCP.AUTH0_SCOPES, usePostMessage: true},function(err,authResult) {
        console.log('Returned from checking session state',err);
        if (err && err.error === 'login_required') {
          reject(new Error('login_required'));
          return;
        }
        if (err) {
          reject(err);
          return;
        }

        resolve(acceptLogin(authResult.accessToken));
      });
    });
  }).catch( err => {
    console.log('Renewing token failed with error',err.message ? err.message : err);
    throw err;
  });
};

const acceptLogin = (token) => {
  return auth_object.then( webauth => {
    return new Promise( (resolve,reject) => {
      webauth.client.userInfo(token, function(err, user) {
        if (err) {
          reject(err);
          return;
        }
        loginStatusPromise = null;
        MASCP.GatorDataReader.ID_TOKEN = token;
        localStorage.setItem('userName',user['http://glycocode/userName']);
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem('profile', JSON.stringify(user));
        resolve(true);
      });
    });
  }).catch( err => {
    console.log('Accept login failed with error',err);
    throw err;
  });
};

const isLoggedIn = function() {
  let token = getStoredToken();
  // let notif;
  if (token && token !== 'null') {
    return isCurrentToken(token)
    .then( current => {
      if (current) {
        return true;
      } else {
        // notif = Vue.toasted.show('Logging in');
        return tryRenewingToken(token)
        .then( () => {
          // notif.goAway(0);
          console.log('Trying to login again after renewal');
          return isLoggedIn();
        });
      }
    })
    .catch( error => {
      if (error.message === 'login_required') {
        // if (notif) {
        //   notif.goAway(0);
        // }

        // Vue.toasted.show('Login expired',{
        //   className: ['glycosuite','error']
        // }).goAway(1500);

        return performLogout()
        .then( () => {
          return { status: 'logged_out' };
        });
      }
      throw error;
    })
  } else {
    return Promise.resolve()
    .then( () => false );
  }
};

const tryLoggingIn = function() {
  return auth_object.then( webauth => {
    return new Promise( (resolve,reject) => {
    webauth.popup.authorize({ connection: 'AzureADv2', login_hint : localStorage.userName ? localStorage.userName : 'abc123@ku.dk'}, (err, authResult) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(acceptLogin(authResult.accessToken));
    });
    });
  });
};

const parseLogin = function() {
  return auth_object.then( webauth => {
    webauth.popup.callback({});
  });
};

MASCP.GatorDataReader.addUnauthorizedListener(() => {
  return handle_unauthorised();
});

let login_status;

const ensureApiLogin = function() {
  return isLoggedIn().then( status => {
    login_status = false;
    MASCP.GatorDataReader.anonymous = true;
    if (status === true) {
      login_status = true;
      MASCP.GatorDataReader.anonymous = false;
      MASCP.GatorDataReader.ID_TOKEN = getStoredToken();
    }
  }).catch( err => {
    console.log(err);
  });
};

let loginStatusPromise = null;

const getLoginStatus = () => {
  if ( ! loginStatusPromise ) {
    loginStatusPromise = Promise.resolve()
    .then( () => ensureApiLogin() )
    .then( () => login_status );
  }
  return loginStatusPromise;
};

export { ensureApiLogin, getLoginStatus, tryLoggingIn, parseLogin }
