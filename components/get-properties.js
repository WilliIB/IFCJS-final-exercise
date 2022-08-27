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