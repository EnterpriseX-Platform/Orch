import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create default admin user if not exists
  const existingAdmin = await prisma.user.findUnique({
    where: { username: 'admin' }
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('admin', 10);
    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@orch',
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        roles: ['admin'],
        isActive: true,
      }
    });
    console.log('✅ Admin user created:', admin.username);
  } else {
    console.log('ℹ️ Admin user already exists');
  }

  // Get admin user for createdBy
  const admin = await prisma.user.findUnique({
    where: { username: 'admin' }
  });
  
  if (!admin) {
    console.log('❌ Admin user not found');
    return;
  }
  
  const adminId = admin.id;
  const flowId = 'pw8f40o972yr2ec7w59t75n1';
  const apiId = 'brv1wp8eduo5yj6o16wnb0em';
  const catalogId = 'cmmcap3ug0009sp75rajmrvm2';
  
  // Create data catalog first
  const existingCatalog = await prisma.dataCatalog.findUnique({
    where: { id: catalogId }
  });
  
  if (!existingCatalog) {
    await prisma.dataCatalog.create({
      data: {
        id: catalogId,
        name: 'Test Catalog',
        source: 'test',
        category: 'MASTER_DATA',
        status: 'ACTIVE',
        isPublic: true,
        createdBy: adminId,
      }
    });
    console.log('✅ Data catalog created');
  }
  
  // Create flow (skip if exists)
  const existingFlow = await prisma.flowIntegration.findUnique({
    where: { id: flowId }
  });
  
  if (!existingFlow) {
    const flow = await prisma.flowIntegration.create({
    data: {
      id: flowId,
      name: 'Test Service Call with Audit',
      description: 'Call external API, log event and audit with JSON array',
      triggerType: 'HTTP',
      executionMode: 'SYNC',
      flowCategory: 'API_GATEWAY',
      nodes: [
        {
          id: 'trigger1',
          type: 'httpRequest',
          position: { x: 100, y: 100 },
          data: {
            label: 'Call JSONPlaceholder API',
            type: 'httpRequest',
            config: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/users' }
          }
        },
        {
          id: 'event1',
          type: 'eventLog',
          position: { x: 300, y: 100 },
          data: {
            label: 'Log Service Call',
            type: 'eventLog',
            config: { event: 'external_api_called', level: 'info', message: 'API called successfully' }
          }
        },
        {
          id: 'audit1',
          type: 'audit',
          position: { x: 500, y: 100 },
          data: {
            label: 'Audit User Data',
            type: 'audit',
            config: {
              action: 'VIEW',
              entityType: 'UserList',
              entityId: 'users-api',
              changes: {
                users: {
                  old: null,
                  new: [
                    { id: 1, name: 'Leanne Graham', email: 'Sincere@april.biz', company: { name: 'Romaguera-Crona' } },
                    { id: 2, name: 'Ervin Howell', email: 'Shanna@melissa.tv', company: { name: 'Deckow-Crist' } }
                  ]
                },
                metadata: { old: null, new: { source: 'jsonplaceholder', count: 2 } }
              }
            }
          }
        },
        {
          id: 'response1',
          type: 'response',
          position: { x: 700, y: 100 },
          data: {
            label: 'Return Response',
            type: 'response',
            config: { statusCode: 200, headers: { 'Content-Type': 'application/json' } }
          }
        }
      ],
      edges: [
        { id: 'e1', source: 'trigger1', target: 'event1' },
        { id: 'e2', source: 'event1', target: 'audit1' },
        { id: 'e3', source: 'audit1', target: 'response1' }
      ],
      createdBy: adminId,
      isActive: true
    }
    });
    console.log('✅ Flow created:', flow.id);
  } else {
    console.log('ℹ️ Flow already exists');
  }
  
  // Create API Registration (skip if exists)
  const existingApi = await prisma.apiRegistration.findUnique({
    where: { id: apiId }
  });
  
  if (!existingApi) {
    const api = await prisma.apiRegistration.create({
    data: {
      id: apiId,
      name: 'Test Users API',
      description: 'Test API with flow execution, event log and audit',
      endpoint: 'test-users',
      method: 'GET',
      backendUrl: 'https://jsonplaceholder.typicode.com/users',
      authType: 'NONE',
      dataCatalogId: catalogId,
      flowId: flowId,
      auditEnabled: true,
      auditFields: [{ id: 'f1', fieldName: 'users', fieldPath: '$.users', fieldType: 'array' }],
      pkXPath: '$.id',
      status: 'ACTIVE',
      createdBy: adminId
    }
    });
    console.log('✅ API Registration created:', api.id);
  } else {
    console.log('ℹ️ API Registration already exists');
  }
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
