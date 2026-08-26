/* ============================================================
   Corte Certo – super-admin/js/super-auth.js
   Gerenciamento de autenticação do super-admin.
   ============================================================ */

var saAuth = {
  getToken: function () {
    return localStorage.getItem('cc_superadmin_token');
  },

  check: function () {
    if (!this.getToken()) {
      window.location.href = 'login.html';
    }
  },

  headers: function () {
    return {
      'authorization': this.getToken(),
      'content-type': 'application/json'
    };
  },

  logout: function () {
    localStorage.removeItem('cc_superadmin_token');
    window.location.href = 'login.html';
  }
};
