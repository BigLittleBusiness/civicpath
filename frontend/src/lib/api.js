import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || '/v1',
  withCredentials: true,
  timeout: 15000,
});

export async function previewCsvImport(entityType, file) {
  const csv = await file.text();
  const response = await api.post('/imports/preview', { entityType, csv });
  return { ...response.data.data, csv };
}
