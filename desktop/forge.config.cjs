module.exports = {
  packagerConfig: {
    asar: true,
    protocols: [
      {
        name: 'Life OS Authentication',
        schemes: ['lifeos'],
      },
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      config: {},
    },
  ],
};
