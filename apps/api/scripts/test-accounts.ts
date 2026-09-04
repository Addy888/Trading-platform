import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = 'http://localhost:3000';

interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  accessToken: string;
  refreshToken: string;
}

async function testLogin(email: string, password: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Login failed' };
    }

    const data: LoginResponse = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function testAdminEndpoint(accessToken: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/dashboard`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return {
      success: response.ok,
      status: response.status,
      data: response.ok ? await response.json() : await response.text(),
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function runTests() {
  console.log('🧪 Testing Test Accounts\n');
  console.log('=' .repeat(60));
  console.log('Make sure the API server is running on http://localhost:3000');
  console.log('=' .repeat(60));
  console.log('');

  // Test ADMIN account
  console.log('📋 Test 1: ADMIN Login');
  console.log('-'.repeat(60));
  const adminLogin = await testLogin('admin@tradeing.local', 'Admin@12345');
  
  if (adminLogin.success && adminLogin.data) {
    console.log('✅ ADMIN login successful');
    console.log(`   User: ${adminLogin.data.user.firstName} ${adminLogin.data.user.lastName}`);
    console.log(`   Email: ${adminLogin.data.user.email}`);
    console.log(`   Role: ${adminLogin.data.user.role}`);
    console.log(`   Access Token: ${adminLogin.data.accessToken.substring(0, 20)}...`);
    
    // Test admin endpoint access
    console.log('\n📋 Test 2: ADMIN accessing /admin/dashboard');
    console.log('-'.repeat(60));
    const adminEndpoint = await testAdminEndpoint(adminLogin.data.accessToken);
    
    if (adminEndpoint.success) {
      console.log('✅ ADMIN can access admin endpoints');
      console.log(`   Status: ${adminEndpoint.status}`);
    } else {
      console.log(`❌ ADMIN cannot access admin endpoints`);
      console.log(`   Status: ${adminEndpoint.status}`);
      console.log(`   Error: ${JSON.stringify(adminEndpoint.data)}`);
    }
  } else {
    console.log(`❌ ADMIN login failed: ${adminLogin.error}`);
  }

  console.log('');

  // Test USER account
  console.log('📋 Test 3: USER Login');
  console.log('-'.repeat(60));
  const userLogin = await testLogin('user@tradeing.local', 'User@12345');
  
  if (userLogin.success && userLogin.data) {
    console.log('✅ USER login successful');
    console.log(`   User: ${userLogin.data.user.firstName} ${userLogin.data.user.lastName}`);
    console.log(`   Email: ${userLogin.data.user.email}`);
    console.log(`   Role: ${userLogin.data.user.role}`);
    console.log(`   Access Token: ${userLogin.data.accessToken.substring(0, 20)}...`);
    
    // Test admin endpoint access (should fail)
    console.log('\n📋 Test 4: USER accessing /admin/dashboard (should fail)');
    console.log('-'.repeat(60));
    const userAdminEndpoint = await testAdminEndpoint(userLogin.data.accessToken);
    
    if (!userAdminEndpoint.success && userAdminEndpoint.status === 403) {
      console.log('✅ USER correctly denied access to admin endpoints');
      console.log(`   Status: ${userAdminEndpoint.status} (Forbidden)`);
    } else if (userAdminEndpoint.success) {
      console.log(`❌ USER should NOT have access to admin endpoints!`);
      console.log(`   Status: ${userAdminEndpoint.status}`);
    } else {
      console.log(`⚠️  Unexpected result`);
      console.log(`   Status: ${userAdminEndpoint.status}`);
      console.log(`   Data: ${JSON.stringify(userAdminEndpoint.data)}`);
    }
  } else {
    console.log(`❌ USER login failed: ${userLogin.error}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎯 Summary');
  console.log('='.repeat(60));
  console.log('\nExpected behavior:');
  console.log('  ✅ ADMIN can login → redirects to /admin');
  console.log('  ✅ ADMIN can access /admin/* endpoints');
  console.log('  ✅ USER can login → redirects to /dashboard');
  console.log('  ✅ USER gets 403 on /admin/* endpoints');
  console.log('\n⚠️  Frontend redirection logic should be implemented in the web app');
  console.log('    based on the user.role field in the login response.\n');
}

runTests().catch(console.error);
