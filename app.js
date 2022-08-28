import { Color } from "three";
import { IfcViewerAPI } from "web-ifc-viewer";
import {
   createOrOpenDatabase,
   loadIfInDB,
   preprocessAndSaveIfc,
   removeDatabase,
} from "./components/db-load";
import { selectMaterial } from "./components/three-utils";
import { decodeIFCString } from "./components/utils";

const container = document.getElementById("viewer-container");
const viewer = new IfcViewerAPI({
   container,
   backgroundColor: new Color(0xeeeeee),
});

viewer.grid.setGrid();
viewer.axes.setAxes();
selectMaterial(viewer);

const previousData = localStorage.getItem("modelsNames");
const db = createOrOpenDatabase();
let properties;

const loadButton = document.getElementById("load-button");
const input = document.getElementById("file-input");
setLoadButtonImg();
function setLoadButtonImg() {
   if (previousData) {
      const path = document.getElementById("load-button-path");
      let d = path.getAttribute("d");
      path.setAttribute(
         "d",
         "M24 3.752l-4.423-3.752-7.771 9.039-7.647-9.008-4.159 4.278c2.285 2.885 5.284 5.903 8.362 8.708l-8.165 9.447 1.343 1.487c1.978-1.335 5.981-4.373 10.205-7.958 4.304 3.67 8.306 6.663 10.229 8.006l1.449-1.278-8.254-9.724c3.287-2.973 6.584-6.354 8.831-9.245z"
      );
   }
}

loadButton.onclick = () => {
   if (previousData) {
      removeDatabase(db);
   }
   input.click();
};
input.addEventListener("change", (event) => {
   preprocessAndSaveIfc(event, viewer, db);
});

loadIfInDB(viewer, db, properties);

loadPropertiesFromDB();
async function loadPropertiesFromDB() {
   const propertiesFromDB = await db.bimProperties.get("properties");
   const data = propertiesFromDB.file;
   properties = JSON.parse(data);
}

// Get properties of selected item and create menu
window.onmousemove = () => viewer.IFC.selector.prePickIfcItem();
window.addEventListener("dblclick", async () => {
   if (dimensionsActive || clippingPlanesActive) {
      return;
   }
   if (!propertiesMenuActive) {
      propertiesButton.click()
   }
   const result = await viewer.IFC.selector.pickIfcItem();
   if (result) {
      const foundProperties = properties[result.id];
      getPropertySets(foundProperties);
      createPropertiesMenu(foundProperties);
      if (simpleChildSelected.li) {
         simpleChildSelected.li.classList.remove("selected");
      }
   } else {
      viewer.IFC.selector.unpickIfcItems();
      removeAllChildren(propsGUI)
   }
});
window.addEventListener("keydown", (event) => {
   if (event.code === "Escape") viewer.IFC.selector.unpickIfcItems();
   removeAllChildren(propsGUI)
});
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

const propertiesMenu = document.getElementById("ifc-property-menu");
const treeMenu = document.getElementById("ifc-tree-menu");

let propertiesMenuActive = false
const propsGUI = document.getElementById("ifc-property-menu-root");
const propertiesButton = document.getElementById("properties-button");
propertiesButton.onclick = () => {
   propertiesMenuActive = !propertiesMenuActive
   propertiesButton.classList.toggle("button-active");
   propertiesMenu.classList.toggle("hidden");
};

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
   const decodedValue = decodeIFCString(value);
   valueElement.textContent = decodedValue;
   propContainer.appendChild(valueElement);

   propsGUI.appendChild(propContainer);
}

function removeAllChildren(element) {
   while (element.firstChild) {
      element.removeChild(element.firstChild);
   }
}

//Spatial tree
const treeButton = document.getElementById("tree-button");
treeButton.onclick = () => {
   treeButton.classList.toggle("button-active");
   treeMenu.classList.toggle("hidden");
   constructTreeAndMenu();
};

async function constructTreeAndMenu() {
   const SpatialTree = await constructSpatialTree();
   createTreeMenu(SpatialTree);
}

// Utils functions
function getFirstItemOfType(type) {
   return Object.values(properties).find((item) => item.type === type);
}

function getAllItemsOfType(type) {
   return Object.values(properties).filter((item) => item.type === type);
}

// Get spatial tree
async function constructSpatialTree() {
   const ifcProject = getFirstItemOfType("IFCPROJECT");

   const ifcProjectNode = {
      expressID: ifcProject.expressID,
      type: "IFCPROJECT",
      children: [],
   };

   const relContained = getAllItemsOfType("IFCRELAGGREGATES");
   const relSpatial = getAllItemsOfType("IFCRELCONTAINEDINSPATIALSTRUCTURE");

   await constructSpatialTreeNode(ifcProjectNode, relContained, relSpatial);

   return ifcProjectNode;
}
// Recursively constructs the spatial tree
async function constructSpatialTreeNode(item, contains, spatials) {
   const spatialRels = spatials.filter(
      (rel) => rel.RelatingStructure === item.expressID
   );
   const containsRels = contains.filter(
      (rel) => rel.RelatingObject === item.expressID
   );

   const spatialRelsIDs = [];
   spatialRels.forEach((rel) => spatialRelsIDs.push(...rel.RelatedElements));

   const containsRelsIDs = [];
   containsRels.forEach((rel) => containsRelsIDs.push(...rel.RelatedObjects));

   const childrenIDs = [...spatialRelsIDs, ...containsRelsIDs];

   const children = [];
   for (let i = 0; i < childrenIDs.length; i++) {
      const childID = childrenIDs[i];
      const props = properties[childID];
      const child = {
         expressID: props.expressID,
         type: props.type,
         children: [],
      };

      await constructSpatialTreeNode(child, contains, spatials);
      children.push(child);
   }

   item.children = children;
}

//Treemenu
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
      viewer.IFC.selector.prepickIfcItemsByID(0, [node.expressID]);
   };
   childNode.onclick = async () => {
      await viewer.IFC.selector.pickIfcItemsByID(
         0,
         [node.expressID],
         true,
         true
      );
      const props = properties[node.expressID];
      getPropertySets(props);
      createPropertiesMenu(props);

      if (simpleChildSelected.li) {
         simpleChildSelected.li.classList.remove("selected");
      }
      childNode.classList.add("selected");
      simpleChildSelected.li = childNode;
   };
}

//Clipping planes
let clippingPlanesActive = false;

const clipperButton = document.getElementById("clip-button");

clipperButton.onclick = () => {
   if (dimensionsActive) {
      measureButton.click();
   }
   clippingPlanesActive = !clippingPlanesActive;
   viewer.clipper.active = clippingPlanesActive;
   clipperButton.classList.toggle("button-active");
};

window.addEventListener("dblclick", () => {
   if (clippingPlanesActive) viewer.clipper.createPlane();
   viewer.context.renderer.postProduction.update();
});

window.addEventListener("keydown", (event) => {
   if (event.code === "Delete" && clippingPlanesActive)
      viewer.clipper.deletePlane();
});

//Dimensions

let dimensionsActive = false;
let dimensionsPreviewActive = false;

const measureButton = document.getElementById("measure-button");

measureButton.onclick = () => {
   if (clippingPlanesActive) {
      clipperButton.click();
   }
   dimensionsActive = !dimensionsActive;
   dimensionsPreviewActive = !dimensionsPreviewActive;

   viewer.dimensions.active = dimensionsActive;
   viewer.dimensions.previewActive = dimensionsPreviewActive;
   measureButton.classList.toggle("button-active");
};

window.addEventListener("dblclick", () => {
   if (dimensionsActive) viewer.dimensions.create();
});

window.addEventListener("keydown", (event) => {
   if (event.code === "Delete" && dimensionsActive) viewer.dimensions.delete();
   viewer.context.renderer.postProduction.update();
});

//Settings screen
const settingsButton = document.getElementById("settings-button");
const settingsScreen = document.getElementById("settings-screen");

settingsButton.onclick = () => {
   settingsButton.classList.toggle("button-active");
   settingsScreen.classList.toggle("hidden");
};
settingsScreen.onclick = () => {
   settingsButton.classList.toggle("button-active");
   settingsScreen.classList.toggle("hidden");
};
