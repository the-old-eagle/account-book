// ⚠️ 安全提示：本文件为前端模拟登录配置，凭证在前端可见，非真正鉴权。
// 仅用于角色区分，不要存放敏感数据。请勿在生产环境使用。
window.AUTH_CONFIG = {
  users: [
    { username: 'admin', password: 'admin123', role: 'admin', label: '管理员' },
    { username: 'user',  password: 'user123',  role: 'user',  label: '普通用户' }
  ]
};
