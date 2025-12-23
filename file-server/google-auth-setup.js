const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = path.join(__dirname, 'token.json');

async function authorize(credentials) {
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting this url:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter the code from the page here: ', async (code) => {
    rl.close();
    const { tokens } = await oauth2Client.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log('Token saved to', TOKEN_PATH);
  });
}

if (require.main === module) {
  const credentialsPath = path.join(__dirname, 'credentials.json');
  if (!fs.existsSync(credentialsPath)) {
    console.error('Error: credentials.json not found.');
    console.error('Download it from: https://console.developers.google.com/');
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  authorize(credentials);
}

module.exports = { authorize };
