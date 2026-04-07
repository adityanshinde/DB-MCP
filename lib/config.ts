export const CONFIG = {
  postgres: {
    url: process.env.POSTGRES_URL || ''
  },
  mssql: {
    user: process.env.MSSQL_USER || '',
    password: process.env.MSSQL_PASSWORD || '',
    server: process.env.MSSQL_SERVER || '',
    database: process.env.MSSQL_DATABASE || '',
    options: {
      encrypt: true,
      trustServerCertificate: true
    }
  },
  app: {
    maxRows: 500,
    allowedSchemas: ['public', 'dbo']
  }
};
