/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__);
figma.ui.resize(800, 600)

class ColorVariable {
    name: string;
    id: string;
    constructor(theName: string, theId: string) {
        this.name = theName;
        this.id = theId;
    }
}

class ColorGroup {
  name: string;
  colors: ColorVariable[];
  constructor(theName: string, theColors: ColorVariable[]) {
    this.name = theName;
    this.colors = theColors;
  } 
}

/**
 * Initialize the plugin by fetching local variable collections and sending them to the UI.
 */
(async () => {
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  let localCollectionsFormatted = [{}]
  localCollections.forEach(collection => {
    localCollectionsFormatted.push({ name: collection.name, id: collection.id })
  })
  figma.ui.postMessage({ localCollections: localCollectionsFormatted });
})();


async function getColorPalettes() {
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();

  const firstCollection = localCollections[0];
  if (!firstCollection) {
    return;
  }

  const colorGroups: ColorGroup[] = [];

  for (const variableId of firstCollection.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(variableId);

    // If it's a color, check for an existing group or create one and add it either way.
    if (variable?.resolvedType === 'COLOR') {
      const variableNameHierarchy = variable.name.split('/');
      const groupName = variableNameHierarchy.length > 1
        ? variableNameHierarchy[variableNameHierarchy.length - 2]
        : 'Ungrouped'; // If no group exists

      // Check if a group with this name already exists.
      let existingColorGroup = colorGroups.find(group => group.name === groupName);

      if (!existingColorGroup) { 
        existingColorGroup = new ColorGroup(groupName, []);
        colorGroups.push(existingColorGroup);
      }

      existingColorGroup.colors.push(new ColorVariable(variable.name, variable.id));
    }
  }

  console.log('colorGroups', colorGroups);
  figma.ui.postMessage({ colorGroups }); 

}
getColorPalettes();

