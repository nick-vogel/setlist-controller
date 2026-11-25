# The connection targets' network

The controller adds no authentication and no network separation in front of the connection targets. ProPresenter, Eos and the ATEM sit on the stage Wi-Fi as they are.

## Why this is out of scope

ProPresenter, Eos and the ATEM have no authentication of their own. Any device that joins the stage Wi-Fi can reach each of them and send it the same commands the controller sends: change the slide, fire a lighting cue, switch the camera. The controller cannot close that gap, because the targets accept a command from anyone who can reach them, not only from the controller.

The risk is accepted for now. The stage Wi-Fi has a private password, given only to the band, the tech team and the devices that need it, and that password is the boundary.

The fix, if the travel router can filter traffic between its Wi-Fi and its wired ports, is a wired segment for the targets and the playback laptop that the Wi-Fi cannot reach. The iPads and the band's phones stay on the Wi-Fi and reach the controller, and only the laptop reaches the targets. The setlist-controller#113 spec lists that segment, and any authentication in front of the targets, as out of scope for the connections epic.

Reconsider this file when the stage Wi-Fi password goes to anyone outside the band and the tech team, when the room's Wi-Fi is shared with the congregation, or when a travel router that can filter between Wi-Fi and wired ports is on hand.

## Prior requests

- #113: "Connections: the producer role and cues that follow playback", user story 42: "I want the network risk written down in the repo, so that the decision to rely on a private Wi-Fi password is on record."
