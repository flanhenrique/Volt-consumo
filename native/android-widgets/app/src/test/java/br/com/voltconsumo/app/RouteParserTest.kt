package br.com.voltconsumo.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RouteParserTest {
    @Test fun parsesReadingEnergy() = assertEquals("reading/energy", RouteParser.fromValue("volt://reading/energy"))
    @Test fun parsesReadingChooser() = assertEquals("reading", RouteParser.fromValue("volt://reading"))
    @Test fun parsesWaterConsumption() = assertEquals("consumption/water", RouteParser.fromValue("volt://consumption/water"))
    @Test fun ignoresOtherSchemes() = assertNull(RouteParser.fromValue("https://www.voltconsumo.com.br/"))
}
