import { Dexie } from "dexie";

// let properties;

export function createOrOpenDatabase() {
   // If the db exists, it opens; if not, dexie creates it automatically
   const db = new Dexie("ModelDatabase");

   // DB with single table "bimModels" with primary key "name" and
   // an index on the property "id"
   db.version(1).stores({
      bimModels: `
           name,
           id,
           level`,
      bimProperties: `
           name`,
   });
   return db;
}

export function loadIfInDB(ifcViewer, db, properties) {
   const previousData = localStorage.getItem("modelsNames");
   if (previousData) {
      loadSavedIfc(ifcViewer, db, properties);
   }
}

export async function preprocessAndSaveIfc(event, ifcViewer, db) {
   const previousData = localStorage.getItem("modelsNames");
   if (previousData) {
      removeDatabase();
   }
   const file = await event.target.files[0];
   const url = URL.createObjectURL(file);
   toggleLoadingScreen();

   // Export to glTF and JSON
   const exportedGltf = await ifcViewer.GLTF.exportIfcFileAsGltf({
      ifcFileUrl: url,
      //Levels disabled for the IFC tree selection to work without rewriting code
      // splitByFloors: true,
      getProperties: true,
   });

   // Store the result in the browser memory
   const models = [];

   const levels = exportedGltf.gltf.allCategories;
   for (const levelName in levels) {
      const level = levels[levelName];
      const file = level.file;
      // Serialize data for saving it
      const data = await file.arrayBuffer();
      models.push({
         name: exportedGltf.id + levelName,
         id: exportedGltf.id,
         level: levelName,
         file: data,
      });
   }

   // Now, store all the models in the database
   await db.bimModels.bulkPut(models);

   // And store all the names of the models
   const serializedNames = JSON.stringify(models.map((model) => model.name));
   localStorage.setItem("modelsNames", serializedNames);

   //Store properties
   const exportedProperties = await exportedGltf.json[0].text();
   const properties = [{ name: "properties", file: exportedProperties }];
   await db.bimProperties.bulkPut(properties);

   location.reload();
}

export async function loadSavedIfc(ifcViewer, db, properties) {
   toggleLoadingScreen();

   // Get the names of the stored models
   const serializedNames = localStorage.getItem("modelsNames");
   const names = JSON.parse(serializedNames);

   // Get all the models from memory and load them
   for (const name of names) {
      const savedModel = await db.bimModels
         .where("name")
         .equals(name)
         .toArray();

      // Deserialize the data
      const data = savedModel[0].file;
      const file = new File([data], "model");
      const url = URL.createObjectURL(file);
      await ifcViewer.GLTF.loadModel(url);
      ifcViewer.context.renderer.postProduction.active = true;
   }
   toggleLoadingScreen();
}

//Get the properties
// export async function loadPropertiesFromDB(db) {
//    const propertiesFromDB = await db.bimProperties.get("properties");
//    const data = await propertiesFromDB.file;
//    const properties = await JSON.parse(data)
//    return properties;
// }

export function removeDatabase(db) {
   localStorage.removeItem("modelsNames");
   db.delete();
   location.reload();
}

// Loading screen
function toggleLoadingScreen() {
   const loadingScreen = document.getElementById("loading-screen");
   loadingScreen.classList.toggle("hidden");
}
