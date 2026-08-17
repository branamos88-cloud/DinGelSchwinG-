package com.dingelschwinng.moeagent;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NexusBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
