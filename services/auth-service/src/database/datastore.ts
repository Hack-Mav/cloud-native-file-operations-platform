import { Datastore } from '@google-cloud/datastore';
import { config } from '../config/config';

class DatastoreClient {
  private datastore: Datastore;

  constructor() {
    this.datastore = new Datastore({
      projectId: config.datastore.projectId,
      keyFilename: config.datastore.keyFilename
    });
  }

  getDatastore(): Datastore {
    return this.datastore;
  }

  // Helper method to create a key
  createKey(kind: string, id?: string | number): any {
    if (id) {
      return this.datastore.key([kind, id]);
    }
    return this.datastore.key(kind);
  }

  // Helper method to save an entity
  async save(entity: any): Promise<any> {
    try {
      await this.datastore.save(entity);
      return entity;
    } catch (error) {
      console.error('Error saving entity:', error);
      throw new Error('Database save operation failed');
    }
  }

  // Helper method to get an entity by key
  async get(key: any): Promise<any> {
    try {
      const [entity] = await this.datastore.get(key);
      return entity;
    } catch (error) {
      console.error('Error getting entity:', error);
      throw new Error('Database get operation failed');
    }
  }

  // Helper method to run a query
  async runQuery(query: any): Promise<any[]> {
    try {
      const [entities] = await this.datastore.runQuery(query);
      return entities;
    } catch (error) {
      console.error('Error running query:', error);
      throw new Error('Database query operation failed');
    }
  }

  // Helper method to delete an entity
  async delete(key: any): Promise<void> {
    try {
      await this.datastore.delete(key);
    } catch (error) {
      console.error('Error deleting entity:', error);
      throw new Error('Database delete operation failed');
    }
  }

  // Helper method to create a transaction
  transaction(): any {
    return this.datastore.transaction();
  }
}

// Export singleton instance
export const datastoreClient = new DatastoreClient();
export default datastoreClient;