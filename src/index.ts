/* CSC-495 Virtual Reality Raycasting, Fall 2022
 * Author: Regis Kopper
 *
 * Based on
 * CSC 5619, Fall 2020
 * Author: Evan Suma Rosenberg
 * 
 * License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 */ 

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Space } from "@babylonjs/core/Maths/math";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { WebXRControllerComponent } from "@babylonjs/core/XR/motionController/webXRControllerComponent";
import { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource";
import { WebXRCamera } from "@babylonjs/core/XR/webXRCamera";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Logger } from "@babylonjs/core/Misc/logger";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import {MeshBuilder} from  "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Ray } from "@babylonjs/core/Culling/ray";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";

// Side effects
import "@babylonjs/core/Helpers/sceneHelpers";

// Import debug layer
import "@babylonjs/inspector";

class Game 
{ 
    private canvas: HTMLCanvasElement;
    private engine: Engine;
    private scene: Scene;

    private xrCamera: WebXRCamera | null; 
    private leftController: WebXRInputSource | null;
    private rightController: WebXRInputSource | null;

    private selectedObject: AbstractMesh | null;
    private selectionTransform: TransformNode | null;

    private laserPointer: LinesMesh | null;

    constructor()
    {
        // Get the canvas element 
        this.canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

        // Generate the BABYLON 3D engine
        this.engine = new Engine(this.canvas, true); 

        // Creates a basic Babylon Scene object
        this.scene = new Scene(this.engine);   

        this.xrCamera = null;
        this.leftController = null;
        this.rightController = null;

        this.selectedObject = null;
        this.selectionTransform = null;

        this.laserPointer = null;
    
    }

    start() : void 
    {
        // Create the scene and then execute this function afterwards
        this.createScene().then(() => {

            // Register a render loop to repeatedly render the scene
            this.engine.runRenderLoop(() => { 
                this.update();
                this.scene.render();
            });

            // Watch for browser/canvas resize events
            window.addEventListener("resize", () => { 
                this.engine.resize();
            });
        });
    }

    private async createScene() 
    {
        // This creates and positions a first-person camera (non-mesh)
        var camera = new UniversalCamera("camera1", new Vector3(0, 1.6, 0), this.scene);
        camera.fov = 90 * Math.PI / 180;
        camera.minZ = .1;
        camera.maxZ = 100;

        // This attaches the camera to the canvas
        camera.attachControl(this.canvas, true);

       // Create a point light
       var pointLight = new PointLight("pointLight", new Vector3(0, 2.5, 0), this.scene);
       pointLight.intensity = 1.0;
       pointLight.diffuse = new Color3(.25, .25, .25);

        // Creates a default skybox
        const environment = this.scene.createDefaultEnvironment({
            createGround: true,
            groundSize: 50,
            skyboxSize: 50,
            skyboxColor: new Color3(0, 0, 0)
        }); 

        environment!.ground!.isPickable = false;
        environment!.skybox!.isPickable = false;

        // Creates the XR experience helper
        const xrHelper = await this.scene.createDefaultXRExperienceAsync({});

        // Assigns the web XR camera to a member variable
        this.xrCamera = xrHelper.baseExperience.camera;

        //Disable teleportation and pointer-based selection
        xrHelper.teleportation.dispose();
        xrHelper.pointerSelection.dispose();

        /* This is how you can use raycasting without a custom implementation
           The benefit of a custom implementation is that you can modify the behavior
           of the interaction technique so it best suits your needs.
        // Register event handler for selection events (pulling the trigger, clicking the mouse button)
        this.scene.onPointerObservable.add((pointerInfo) => {
            this.processPointer(pointerInfo);
        });
        */

        // Create points for the laser pointer
        var laserPoints = [];
        laserPoints.push(Vector3.Zero());
        laserPoints.push(new Vector3(0, 0, 20));

        // Create a laser pointer and make sure it is not pickable
        this.laserPointer = MeshBuilder.CreateLines("laserPointer", {points: laserPoints}, this.scene);
        this.laserPointer.color = Color3.Yellow();
        this.laserPointer.alpha = .5;
        this.laserPointer.visibility = 0;
        this.laserPointer.isPickable = false;

        // This transform will be used to attach objects to the laser pointer
        this.selectionTransform = new TransformNode("selectionTransform", this.scene);
        this.selectionTransform.parent = this.laserPointer;
        
        // Create a blue emissive material
        var cubeMaterial = new StandardMaterial("blueMaterial", this.scene);
        cubeMaterial.diffuseColor = new Color3(.284, .73, .831);
        cubeMaterial.specularColor = Color3.Black();
        cubeMaterial.emissiveColor = new Color3(.284, .73, .831);

        // Create a test cube at a convenient place
        // var testCube = MeshBuilder.CreateBox("testCube", {size: .25}, this.scene);
        // testCube.position = new Vector3(.6, 1.5, 2);
        // testCube.material = cubeMaterial;
        // testCube.edgesWidth = .3;

        // Create a 3D selection and manipulation testbed
        for(let i=0; i < 100; i++)
        {
            let cube = MeshBuilder.CreateBox("cube", {size: Math.random() * .3 + .1}, this.scene);
            cube.position = new Vector3(Math.random() * 30 - 15, Math.random() * 5 + .2, Math.random() * 30 - 15);
            cube.material = cubeMaterial;
            cube.edgesWidth = .3;
        }

        // Attach the laser pointer to the right controller when it is connected
        xrHelper.input.onControllerAddedObservable.add((inputSource) => {
            if(inputSource.uniqueId.endsWith("right"))
            {
                this.rightController = inputSource;
                this.laserPointer!.parent = this.rightController.pointer;
                this.laserPointer!.visibility = 1;
            }
            else
            {
                this.leftController = inputSource;
            }
        });

        // Don't forget to deparent the laser pointer or it will be destroyed!
        xrHelper.input.onControllerRemovedObservable.add((inputSource) => {

            if(inputSource.uniqueId.endsWith("right")) 
            {
                this.laserPointer!.parent = null;
                this.laserPointer!.visibility = 0;
            }
        });


        this.scene.debugLayer.show(); 
    }

    /* Here is the observable handler for the default WebXR raycasting
       implementation.
    // Event handler for processing pointer selection events
    private processPointer(pointerInfo: PointerInfo)
    {
        switch (pointerInfo.type) {

            case PointerEventTypes.POINTERDOWN:

                if(this.selectedObject)
                {
                    this.selectedObject.disableEdgesRendering();
                    this.selectedObject = null;
                }

                // if an object was hit
                if(pointerInfo.pickInfo?.hit)
                {
                    this.selectedObject = pointerInfo.pickInfo.pickedMesh;
                    this.selectedObject!.enableEdgesRendering();
                }
            break;
        }
    }
    */


    // The main update loop will be executed once per frame before the scene is rendered
    private update() : void
    {
        // Polling for controller input
        this.processControllerInput();
    }

    // Process event handlers for controller input
    private processControllerInput()
    {
        //select the object when it intersects with the right trigger
        this.onRightTrigger(this.rightController?.motionController?.getComponent("xr-standard-trigger"));
        
        //use a "reel" technique to manipulate the distance of the object by pushing the thumbstick
        this.onRightThumbstick(this.rightController?.motionController?.getComponent("xr-standard-thumbstick"));
    }

    // Attach the object to the ray when trigger is pressed, and dettach it when the trigger is released
    private onRightTrigger(component?: WebXRControllerComponent)
    {
        if(component?.changes.pressed)
        {
            if(component?.pressed)
            {
                this.laserPointer!.color = Color3.Green();

                var ray = new Ray(this.rightController!.pointer.position, this.rightController!.pointer.forward, 20);
                var pickInfo = this.scene.pickWithRay(ray);

                // Deselect the currently selected object 
                if(this.selectedObject)
                {
                    this.selectedObject!.disableEdgesRendering();
                    this.selectedObject = null;
                }

                // If an object was hit, select it
                if(pickInfo?.hit)
                {
                    this.selectedObject = pickInfo!.pickedMesh;
                    this!.selectedObject!.enableEdgesRendering();

                    // Parent the object to the transform on the laser pointer
                    this.selectionTransform!.position = new Vector3(0, 0, pickInfo.distance);
                    this.selectedObject!.setParent(this.selectionTransform);

                    // Emit a 50ms, 0.5 intensity haptic pulse
                    this.rightController?.motionController?.pulse(0.2,50);
                }
            }
            else
            {
                // Reset the laser pointer color
                this.laserPointer!.color = Color3.Blue();
    
                // Release the object from the laser pointer
                if(this.selectedObject)
                {
                    this.selectedObject!.setParent(null);

                    // Emit a 50ms, 0.5 intensity haptic pulse
                    this.rightController?.motionController?.pulse(0.2,50);
                }
            }
        }
    }

    // Implement a "reel technique to manipulate the object's depth"
    private onRightThumbstick(component?: WebXRControllerComponent)
    {
        // If we have an object that is currently attached to the laser pointer
        // and the thumbstick was pushed
        if(this.selectedObject && this.selectedObject.parent)
        {
            // Use delta time to calculate the proper speed
            // DeltaTime is the time, in milliseconds, between 
            // the current and the last frame
            var moveDistance = -component!.axes.y * (this.engine.getDeltaTime() / 1000) * 3;

            // Translate the object along the depth ray in world space
            this.selectedObject.translate(this.laserPointer!.forward, moveDistance, Space.WORLD);
        }
    }

}
/******* End of the Game class ******/   

// start the game
var game = new Game();
game.start();