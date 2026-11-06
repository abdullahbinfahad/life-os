const path = require('node:path');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.join(__dirname, 'assets', 'lifeos'),
    protocols: [
      {
        name: 'Life OS Authentication',
        schemes: ['lifeos'],
      },
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'lifeos',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      config: {},
    },
  ],
};
