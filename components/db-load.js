import { Color } from "three";
import { IfcViewerAPI } from "web-ifc-viewer";
import { Dexie } from "dexie";

const container = document.getElementById("viewer-container");
const viewer = new IfcViewerAPI({
   container,
   backgroundColor: new Color(0xffffff),
});
viewer.grid.setGrid();
viewer.axes.setAxes();

let properties;

const db = createOrOpenDatabase();

// If the db exists, it opens; if not, dexie creates it automatically
function createOrOpenDatabase() {
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

// Get all buttons
const loadButton = document.getElementById("load-button");
const removeButton = document.getElementById("remove-button");

// Set up buttons logic
removeButton.onclick = () => removeDatabase();

// We use the button to display the GUI and the input to load the file
const input = document.getElementById("file-input");
loadButton.onclick = () => input.click();
input.onchange = preprocessAndSaveIfc();

// Find out if there is any data stored; if not, prevent button click
updateButtons();

function updateButtons() {
   const previousData = localStorage.getItem("modelsNames");

   if (!previousData) {
      removeButton.classList.add("disabled");
      loadButton.classList.remove("disabled");
   } else {
      loadSavedIfc();
      removeButton.classList.remove("disabled");
      loadButton.classList.add("disabled");
   }
}

// Saving the model

async function preprocessAndSaveIfc(event) {
   const file = event.target.files[0];
   const url = URL.createObjectURL(file);

   // Export to glTF and JSON
   const exportedGltf = await viewer.GLTF.exportIfcFileAsGltf({
      ifcFileUrl: url,
      splitByFloors: true,
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

async function loadSavedIfc() {
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
      await viewer.GLTF.loadModel(url);
   }

   //Get the properties
   const propertiesFromDB = await db.bimProperties.get("properties");
   const data = propertiesFromDB.file;
   properties = JSON.parse(data);
}

function removeDatabase() {
   localStorage.removeItem("modelsNames");
   db.delete();
   location.reload();
}

// Get properties of selected item
window.ondblclick = async () => {
   const result = await viewer.IFC.selector.pickIfcItem(true);
   const foundProperties = properties[result.id];
   getPropertySets(foundProperties);
   console.log(foundProperties);
};
window.onmousemove = () => viewer.IFC.selector.prePickIfcItem();

// Gets the property sets

function getPropertySets(props) {
   const id = props.expressID;
   const propertyValues = Object.values(properties);
   const allPsetsRels = propertyValues.filter(
      (item) => item.type === "IFCRELDEFINESBYPROPERTIES"
   );
   const relatedPsetsRels = allPsetsRels.filter((item) =>
      item.RelatedObjects.includes(id)
   );
   const psets = relatedPsetsRels.map(
      (item) => properties[item.RelatingPropertyDefinition]
   );
   for (let pset of psets) {
      pset.HasProperty = pset.HasProperties.map((id) => properties[id]);
   }
   props.psets = psets;
}
