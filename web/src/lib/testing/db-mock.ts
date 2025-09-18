/* eslint-disable @typescript-eslint/no-explicit-any */
import { ObjectId } from "mongodb";

// In-memory database for testing
class MockDatabase {
  private collections: Map<string, Map<string, any>> = new Map();

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    const data = this.collections.get(name)!;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return {
      async findOne(filter: any) {
        for (const [, doc] of data) {
          if (self.matches(doc, filter)) {
            return doc;
          }
        }
        return null;
      },

      async insertOne(document: any) {
        const doc = {
          _id: new ObjectId(),
          ...document,
        };
        data.set(doc._id.toString(), doc);
        return {
          insertedId: doc._id,
          acknowledged: true,
        };
      },

      async updateOne(filter: any, update: any, options: any = {}) {
        let matched = false;

        for (const [id, doc] of data) {
          if (self.matches(doc, filter)) {
            matched = true;

            if (update.$set) {
              Object.entries(update.$set).forEach(([key, value]) => {
                self.setNestedValue(doc, key, value);
              });
            }

            if (update.$unset) {
              Object.keys(update.$unset).forEach((key) => {
                self.deleteNestedValue(doc, key);
              });
            }

            if (update.$setOnInsert && options.upsert && !matched) {
              Object.assign(doc, update.$setOnInsert);
            }

            if (update.$currentDate) {
              Object.keys(update.$currentDate).forEach((key) => {
                self.setNestedValue(doc, key, new Date());
              });
            }

            data.set(id, doc);
            return {
              matchedCount: 1,
              modifiedCount: 1,
              acknowledged: true,
            };
          }
        }

        // Handle upsert
        if (options.upsert && !matched) {
          const newDoc = {
            _id: new ObjectId(),
            ...filter,
            ...(update.$setOnInsert || {}),
            ...(update.$set || {}),
          };

          if (update.$set) {
            Object.entries(update.$set).forEach(([key, value]) => {
              self.setNestedValue(newDoc, key, value);
            });
          }

          data.set(newDoc._id.toString(), newDoc);
          return {
            matchedCount: 0,
            modifiedCount: 0,
            upsertedId: newDoc._id,
            acknowledged: true,
          };
        }

        return {
          matchedCount: 0,
          modifiedCount: 0,
          acknowledged: true,
        };
      },

      async find(filter: any = {}) {
        const results: any[] = [];
        for (const [, doc] of data) {
          if (self.matches(doc, filter)) {
            results.push(doc);
          }
        }

        return {
          sort: () => ({
            limit: (n: number) => ({
              toArray: async () => results.slice(0, n),
            }),
            toArray: async () => results,
          }),
          toArray: async () => results,
        };
      },

      async deleteMany(filter: any) {
        let count = 0;
        for (const [id, doc] of data) {
          if (self.matches(doc, filter)) {
            data.delete(id);
            count++;
          }
        }
        return { deletedCount: count };
      },

      async createIndex() {
        return "test_index";
      },
    };
  }

  private matches(doc: any, filter: any): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (doc[key] !== value) {
        return false;
      }
    }
    return true;
  }

  private setNestedValue(obj: any, path: string, value: any) {
    const keys = path.split(".");
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
  }

  private deleteNestedValue(obj: any, path: string) {
    const keys = path.split(".");
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        return;
      }
      current = current[keys[i]];
    }

    delete current[keys[keys.length - 1]];
  }

  clear() {
    this.collections.clear();
  }
}

export const mockDatabase = new MockDatabase();

export const mockMongoClient = {
  db: () => mockDatabase,
  close: jest.fn(),
  connect: jest.fn(),
};

export function clearMockDatabase() {
  mockDatabase.clear();
}
