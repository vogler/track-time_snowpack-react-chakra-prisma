/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  mount: {
    public: {url: '/', static: true},
    src: {url: '/dist'},
  },
  plugins: [
    '@snowpack/plugin-react-refresh',
    '@snowpack/plugin-typescript',
  ],
  packageOptions: {
    // source: 'remote',
    external: ['snowpack', 'express'] // ignore these imports from server.ts since they are not needed by the client (and make install fail)
  }
};