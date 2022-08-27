import { Color } from "three";
import { Dexie } from "dexie";
import { IfcViewerAPI } from "web-ifc-viewer";
import {
   createOrOpenDatabase,
   loadIfInDB,
   loadSavedIfc,
   preprocessAndSaveIfc,
   removeDatabase,
} from "./components/db-load";
import { selectMaterial } from "./components/three-utils";
// import { getPropertySets } from "./components/get-properties";

const container = document.getElementById("viewer-container");
const ifcViewer = new IfcViewerAPI({
   container,
   backgroundColor: new Color(0xeeeeee),
});

//Create grid an axes
ifcViewer.grid.setGrid();
ifcViewer.axes.setAxes();

selectMaterial(ifcViewer);

const previousData = localStorage.getItem("modelsNames");

const db = createOrOpenDatabase();

let properties;

const loadButton = document.getElementById("load-button");
const input = document.getElementById("file-input");
loadButton.onclick = () => {
   if (previousData) {
      removeDatabase(db);
   }
   input.click();
};
input.addEventListener("change", (event) => {
   preprocessAndSaveIfc(event, ifcViewer, db);
});

loadIfInDB(ifcViewer, db, properties);

loadPropertiesFromDB();
async function loadPropertiesFromDB() {
   const propertiesFromDB = await db.bimProperties.get("properties");
   const data = propertiesFromDB.file;
   properties = JSON.parse(data);
}

// Get properties of selected item
window.onmousemove = () => ifcViewer.IFC.selector.prePickIfcItem();
window.ondblclick = async () => {
   const result = await ifcViewer.IFC.selector.pickIfcItem();
   if (result) {
      const foundProperties = properties[result.id];
      getPropertySets(foundProperties);
      console.log(foundProperties);
   } else {
      ifcViewer.IFC.selector.unpickIfcItems()
   }
};
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
// //Properties
// window.ondblclick = async () => {
//    const result = await ifcViewer.IFC.selector.pickIfcItem();
//    if (!result) {
//       return;
//    }
//    const { modelID, id } = result;
//    ifcViewer.IFC;
//    const props = await ifcViewer.IFC.getProperties(modelID, id, true, false);
//    createPropertiesMenu(props);
// };

const propsGUI = document.getElementById("ifc-property-menu-root");

function createPropertiesMenu(properties) {
   removeAllChildren(propsGUI);

   delete properties.psets;
   delete properties.mats;
   delete properties.type;

   for (let key in properties) {
      createPropertyEntry(key, properties[key]);
   }
}

function createPropertyEntry(key, value) {
   const propContainer = document.createElement("div");
   propContainer.classList.add("ifc-property-item");

   if (value === null || value === undefined) value = "undefined";
   else if (value.value) value = value.value;

   const keyElement = document.createElement("div");
   keyElement.textContent = key;
   propContainer.appendChild(keyElement);

   const valueElement = document.createElement("div");
   valueElement.classList.add("ifc-property-value");
   valueElement.textContent = value;
   propContainer.appendChild(valueElement);

   propsGUI.appendChild(propContainer);
}

function removeAllChildren(element) {
   while (element.firstChild) {
      element.removeChild(element.firstChild);
   }
}

//Spatial tree
const toggler = document.getElementsByClassName("caret");

for (let i = 0; i < toggler.length; i++) {
   toggler[i].addEventListener("click", () => {
      toggler[i].parentElement
         .querySelector(".nested")
         .classList.toggle("active");
      toggler[i].classList.toggle("caret-down");
   });
}

function createTreeMenu(ifcProject) {
   const root = document.getElementById("tree-root");
   removeAllChildren(root);
   const ifcProjectNode = createNestedChild(root, ifcProject);
   ifcProject.children.forEach((child) => {
      constructTreeMenuNode(ifcProjectNode, child);
   });
}

function nodeToString(node) {
   return `${node.type} - ${node.expressID}`;
}

function constructTreeMenuNode(parent, node) {
   const children = node.children;
   if (children.length === 0) {
      createSimpleChild(parent, node);
      return;
   }
   const nodeElement = createNestedChild(parent, node);
   children.forEach((child) => {
      constructTreeMenuNode(nodeElement, child);
   });
}

function createNestedChild(parent, node) {
   const content = nodeToString(node);
   const root = document.createElement("li");
   createTitle(root, content);
   const childrenContainer = document.createElement("ul");
   childrenContainer.classList.add("nested");
   root.appendChild(childrenContainer);
   parent.appendChild(root);
   return childrenContainer;
}

function createTitle(parent, content) {
   const title = document.createElement("span");
   title.classList.add("caret");
   title.onclick = () => {
      title.parentElement.querySelector(".nested").classList.toggle("active");
      title.classList.toggle("caret-down");
   };
   title.textContent = content;
   parent.appendChild(title);
}

const simpleChildSelected = { li: 0 };

function createSimpleChild(parent, node) {
   const content = nodeToString(node);
   const childNode = document.createElement("li");
   childNode.classList.add("leaf-node");
   childNode.textContent = content;
   parent.appendChild(childNode);

   childNode.onmouseenter = () => {
      ifcViewer.IFC.selector.prepickIfcItemsByID(0, [node.expressID]);
   };
   childNode.onclick = async () => {
      ifcViewer.IFC.selector.pickIfcItemsByID(0, [node.expressID], true, true);
      const props = await ifcViewer.IFC.getProperties(
         0,
         node.expressID,
         true,
         false
      );
      createPropertiesMenu(props);
      if (simpleChildSelected.li) {
         simpleChildSelected.li.classList.remove("selected");
      }
      childNode.classList.add("selected");
      simpleChildSelected.li = childNode;
   };
}
