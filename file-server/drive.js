const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

let driveClient = null;

async function getAuthenticatedClient() {
  if (driveClient) return driveClient;

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Check if we have saved token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    auth.setCredentials(token);
  }

  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

async function uploadFileToDrive(filePath, fileName = null) {
  try {
    const drive = await getAuthenticatedClient();
    const fileMetadata = { name: fileName || path.basename(filePath) };
    
    const media = {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink',
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading to Drive:', error);
    throw error;
  }
}

async function listDriveFiles(folderId = null) {
  try {
    const drive = await getAuthenticatedClient();
    const query = folderId ? `'${folderId}' in parents and trashed=false` : "trashed=false";

    const response = await drive.files.list({
      q: query,
      spaces: 'drive',
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
      pageSize: 50,
    });

    return response.data.files || [];
  } catch (error) {
    console.error('Error listing Drive files:', error);
    throw error;
  }
}

async function downloadFromDrive(fileId, destPath) {
  try {
    const drive = await getAuthenticatedClient();
    const dest = fs.createWriteStream(destPath);

    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      response.data
        .on('end', () => resolve(destPath))
        .on('error', reject)
        .pipe(dest);
    });
  } catch (error) {
    console.error('Error downloading from Drive:', error);
    throw error;
  }
}

async function deleteDriveFile(fileId) {
  try {
    const drive = await getAuthenticatedClient();
    await drive.files.delete({ fileId });
    return { success: true };
  } catch (error) {
    console.error('Error deleting from Drive:', error);
    throw error;
  }
}

async function createDriveFolder(folderName, parentId = null) {
  try {
    const drive = await getAuthenticatedClient();
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };

    if (parentId) {
      fileMetadata.parents = [parentId];
    }

    const response = await drive.files.create({
      resource: fileMetadata,
      fields: 'id, name',
    });

    return response.data;
  } catch (error) {
    console.error('Error creating Drive folder:', error);
    throw error;
  }
}

function getAuthUrl(oauth2Client) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
}

module.exports = {
  getAuthenticatedClient,
  uploadFileToDrive,
  listDriveFiles,
  downloadFromDrive,
  deleteDriveFile,
  createDriveFolder,
  getAuthUrl,
  CREDENTIALS_PATH,
  TOKEN_PATH,
};
