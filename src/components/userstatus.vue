<template>
  <label v-if="user != 'anonymous'">
  {{ user }}
  </label>
  <label v-else v-on:click="login" style="cursor: pointer;" >
    Log in
  </label>
</template>

<script>

import Vue from 'vue';

import { tryLoggingIn, getLoginStatus, performLogout, ensureApiLogin, getUserId } from '../js/auth/azuread';

let globalUser = new Vue({
  data: { user: 'anonymous' }
});

export default {
  name: 'UserStatus',
  props: {
  },
  created: function() {
    return this.checkUser();
  },
  methods: {
    checkUser() {
      return getLoginStatus().then( status => {
        this.$set(this,'user', status ?  getUserId() : 'anonymous' );
        if (this.user !== 'anonymous') {
          document.querySelector(':root').style.setProperty('--base-hue', 170);
        }
        return status;
      });
    },
    logout: function(ev) {
      performLogout()
      .then( () => ensureApiLogin() )
      .then ( () => {
        document.querySelector(':root').style.removeProperty('--base-hue');
        this.$set(this,'user', 'anonymous' );
      });
    },
    login: function(ev) {
      tryLoggingIn().then ( () => {
        this.checkUser();
      });
    }
  },
  computed: {
    user: {
      get: () => {
        return globalUser.$data.user;
      },
      set: (user) => {
        globalUser.$data.user = user;
      }
    }
  }
}
</script>