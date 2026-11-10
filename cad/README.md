# CAD

SolidWorks parts and assemblies for P3DRO. Printed on a Bambu Lab P1S.

## Layout

| Folder | Contents |
| --- | --- |
| `parts/` | Printed structure: body top and bottom, body supports, ESP32 mount, leg and servo brackets (including the mirrored copies), battery holder, SBEC holder, and servo horn. |
| `components/` | Reference models of the purchased MG996R, ESP32, PCA9685, SBEC, and battery, plus the complete-servo sub-assembly used in the leg. |
| `assemblies/` | Full body, one leg, and the simplified assemblies used to export geometry to Simscape. |
| `print/` | STL exports and Bambu Studio plates (`.3mf`). The plate geometry is embedded in the `.3mf`; the part names stored in the plate match the STL filenames in this folder. |

## Filenames and assembly references

The `.SLDPRT` and `.SLDASM` filenames are the names the assemblies were saved with, including spaces. Those files do not store recoverable plain-text paths, so the part filenames were left unchanged and SolidWorks can still match them by name.

The folders used to be `A Team/` and `Electronic components/`. If an assembly opens with missing parts, point SolidWorks at `cad/parts/` and `cad/components/`. Rename a SolidWorks file only from inside SolidWorks, so the assembly references update with it.

Hole-practice coupons, a PCA hole test, and a components-fit assembly were fit checks during printing. They are not part of the robot and are not in this tree. The printed robot uses `parts/` and `print/`.
