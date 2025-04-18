import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface ManageApexArgs {
  operation: 'create' | 'update' | 'delete';
  className: string;
  body?: string;
  status?: 'Active' | 'Inactive';
  apiVersion?: string;
}

export const MANAGE_APEX: Tool = {
  name: "salesforce_manage_apex",
  description: "Manage Apex classes in Salesforce (create, update, or delete)",
  inputSchema: {
    type: "object",
    required: ["operation", "className"],
    properties: {
      operation: {
        type: "string",
        enum: ["create", "update", "delete"],
        description: "The operation to perform on the Apex class",
      },
      className: {
        type: "string",
        description: "The name of the Apex class",
      },
      body: {
        type: "string",
        description: "The Apex class code (required for create and update operations)",
      },
      status: {
        type: "string",
        enum: ["Active", "Inactive"],
        description: "The status of the Apex class",
      },
      apiVersion: {
        type: "string",
        description: "The API version for the Apex class",
      },
    },
  },
};

export async function handleManageApex(conn: any, args: ManageApexArgs) {
  try {
    const apiVersion = args.apiVersion || '62.0';
    
    switch (args.operation) {
      case 'create':
        if (!args.body) {
          throw new Error('Body is required for create operation');
        }
        
        const createResult = await conn.tooling.sobject('ApexClass').create({
          Name: args.className,
          Body: args.body,
          Status: args.status || 'Active',
          ApiVersion: apiVersion
        });
        
        if (!createResult.success) {
          throw new Error(`Failed to create Apex class: ${args.className}. Details: ${JSON.stringify(createResult.errors)}`);
        }
        
        return {
          content: [{
            type: "text",
            text: `Successfully created Apex class: ${args.className} with ID: ${createResult.id}`,
          }],
        };
        
      case 'update':
        if (!args.body) {
          throw new Error('Body is required for update operation');
        }
        
        const containerResult = await conn.tooling.sobject('MetadataContainer').create({
          Name: `${args.className}_${Date.now()}`
        });
        if (!containerResult.success) {
          throw new Error(`Failed to create MetadataContainer: ${JSON.stringify(containerResult.errors)}`);
        }
        
        const queryResult = await conn.tooling.query(`SELECT Id FROM ApexClass WHERE Name = '${args.className}'`);
        
        if (!queryResult.records || queryResult.records.length === 0) {
          throw new Error(`Apex class ${args.className} not found`);
        }
        
        const apexClassId = queryResult.records[0].Id;
        
        const memberResult = await conn.tooling.sobject('ApexClassMember').create({
          MetadataContainerId: containerResult.id,
          ContentEntityId: apexClassId,
          Body: args.body
        });
        
        if (!memberResult.success) {
          throw new Error(`Failed to create ApexClassMember: ${JSON.stringify(memberResult.errors)}`);
        }
        
        const deployResult = await conn.tooling.sobject('ContainerAsyncRequest').create({
          IsCheckOnly: false,
          MetadataContainerId: containerResult.id
        });
        
        if (!deployResult.success) {
          throw new Error(`Failed to deploy container: ${JSON.stringify(deployResult.errors)}`);
        }
        
        let deploymentStatus;
        do {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const statusResult = await conn.tooling.sobject('ContainerAsyncRequest').retrieve(deployResult.id);
          deploymentStatus = statusResult.State;
        } while (deploymentStatus === 'Queued' || deploymentStatus === 'InProgress');
        
        if (deploymentStatus !== 'Completed') {
          throw new Error(`Deployment failed with status: ${deploymentStatus}`);
        }
        
        return {
          content: [{
            type: "text",
            text: `Successfully updated Apex class: ${args.className} with ID: ${apexClassId}`,
          }],
        };
        
      case 'delete':
        const deleteQueryResult = await conn.tooling.query(`SELECT Id FROM ApexClass WHERE Name = '${args.className}'`);
        
        if (!deleteQueryResult.records || deleteQueryResult.records.length === 0) {
          throw new Error(`Apex class ${args.className} not found`);
        }
        
        const deleteApexClassId = deleteQueryResult.records[0].Id;
        
        const deleteResult = await conn.tooling.sobject('ApexClass').delete(deleteApexClassId);
        
        if (!deleteResult.success) {
          throw new Error(`Failed to delete Apex class: ${args.className}. Details: ${JSON.stringify(deleteResult.errors)}`);
        }
        
        return {
          content: [{
            type: "text",
            text: `Successfully deleted Apex class: ${args.className} with ID: ${deleteApexClassId}`,
          }],
        };
        
      default:
        throw new Error(`Invalid operation: ${args.operation}`);
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error managing Apex class: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
} 