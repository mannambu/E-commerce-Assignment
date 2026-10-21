// Dùng cấu hình giả trước khi import service. Test không kết nối MongoDB.
process.env.DB_USERNAME = 'unit_test'
process.env.DB_PASSWORD = 'unit_test'
process.env.DB_NAME = 'unit_test'
process.env.JWT_SECRET_ACCESS_TOKEN = 'unit-test-access-secret'
process.env.JWT_SECRET_REFRESH_TOKEN = 'unit-test-refresh-secret'
process.env.PASSWORD_PEPPER = 'unit-test-pepper'
process.env.DOTENV_CONFIG_QUIET = 'true'

process.env.DB_URI = 'mongodb://127.0.0.1:27017'
