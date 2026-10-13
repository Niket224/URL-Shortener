const { baseUrl, frontendUrl } = require('./config');

describe('deployment origins', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  test('local development retains defaults', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.BASE_URL;
    delete process.env.FRONTEND_URL;
    delete process.env.PORT;
    expect(baseUrl()).toBe('http://localhost:5001');
    expect(frontendUrl()).toBe('http://localhost:5173');
  });

  test('production requires both origins instead of localhost fallbacks', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BASE_URL;
    process.env.FRONTEND_URL = '   ';
    expect(baseUrl).toThrow('BASE_URL is required');
    expect(frontendUrl).toThrow('FRONTEND_URL is required');
  });

  test('configured origins normalize trailing slashes and reject paths', () => {
    process.env.BASE_URL = ' https://short.example/ ';
    expect(baseUrl()).toBe('https://short.example');
    process.env.FRONTEND_URL = 'https://app.example/api';
    expect(frontendUrl).toThrow('FRONTEND_URL must be an HTTP(S) origin');
  });
});
